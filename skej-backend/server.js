require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const { addYears, addMonths, parseISO, format, isValid, subDays, addDays, isBefore, isAfter } = require('date-fns');

const app = express();

const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_DEFAULT_MODEL = process.env.OPENAI_DEFAULT_MODEL || 'gpt-5-2';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3001';

// Initialize Supabase client
let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY && SUPABASE_URL !== 'your_supabase_url_here') {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
  console.log('✓ Supabase client initialized');
}

// Initialize Anthropic Client
const anthropic = new Anthropic({
  apiKey: ANTHROPIC_API_KEY || 'dummy_key',
});

// Initialize OpenAI Client (optional fallback if Anthropic is unavailable)
const openai = OPENAI_API_KEY
  ? new OpenAI({ apiKey: OPENAI_API_KEY })
  : null;

let stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  totalTokensUsed: { input: 0, output: 0 },
  requestsByModel: {},
  errors: []
};

function isAnthropicCreditError(err) {
  const msg = (err && err.message) ? String(err.message) : '';
  return msg.toLowerCase().includes('credit balance is too low')
    || msg.toLowerCase().includes('insufficient credits')
    || msg.toLowerCase().includes('plans & billing');
}

function isAuthOrCreditsError(err) {
  const msg = (err && err.message) ? String(err.message) : '';
  return isAnthropicCreditError(err)
    || msg.toLowerCase().includes('invalid api key')
    || msg.toLowerCase().includes('unauthorized')
    || msg.toLowerCase().includes('401');
}

function anthropicToolsToOpenAITools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return [];
  return tools
    .filter(t => t && typeof t.name === 'string')
    .map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.input_schema || { type: 'object', properties: {} },
      }
    }));
}

function mapRequestedModelToOpenAI(model) {
  const m = (model || '').trim().toLowerCase();
  // If caller already passes an OpenAI model id, use it.
  if (m.startsWith('gpt-') || m.startsWith('o1-') || m.startsWith('o3-')) return model;
  return OPENAI_DEFAULT_MODEL;
}

async function runOpenAIWithTools({ model, max_tokens, temperature, system, messages, tools }) {
  if (!openai) {
    const e = new Error('OPENAI_API_KEY not configured');
    e.code = 'OPENAI_NOT_CONFIGURED';
    throw e;
  }

  const openAITools = anthropicToolsToOpenAITools(tools);
  const usedModel = mapRequestedModelToOpenAI(model);

  let currentMessages = [
    ...(system ? [{ role: 'system', content: system }] : []),
    ...(Array.isArray(messages) ? messages : []),
  ];

  let turnCount = 0;
  while (turnCount < 10) {
    turnCount++;

    const completion = await openai.chat.completions.create({
      model: usedModel,
      messages: currentMessages,
      tools: openAITools.length ? openAITools : undefined,
      tool_choice: openAITools.length ? 'auto' : undefined,
      temperature: typeof temperature === 'number' ? temperature : 0.7,
      max_tokens: typeof max_tokens === 'number' ? max_tokens : 4096,
    });

    const choice = completion.choices && completion.choices[0];
    const msg = choice && choice.message ? choice.message : null;
    const toolCalls = msg && Array.isArray(msg.tool_calls) ? msg.tool_calls : [];

    if (toolCalls.length) {
      // Add the assistant message with tool calls.
      currentMessages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: toolCalls,
      });

      // Execute tools and add tool results.
      for (const tc of toolCalls) {
        const fn = tc.function || {};
        const name = fn.name;
        let input = {};
        try {
          input = fn.arguments ? JSON.parse(fn.arguments) : {};
        } catch {
          input = {};
        }
        const result = await executeTool(name, input);
        currentMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    const text = (msg && msg.content) ? msg.content : '';
    return {
      model: usedModel,
      turnCount,
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
    };
  }

  return {
    model: mapRequestedModelToOpenAI(model),
    turnCount: 10,
    content: [{ type: 'text', text: 'I reached the maximum tool-call depth.' }],
    stop_reason: 'max_turns',
  };
}

// CORS configuration for production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [FRONTEND_URL, /\.vercel\.app$/]
    : '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));

// Normalize duplicate slashes in URLs (e.g. "/api//schedule") to avoid 404s when
// NEXT_PUBLIC_API_URL accidentally includes a trailing slash.
app.use((req, _res, next) => {
  const url = req.url || '';
  const qIndex = url.indexOf('?');
  const path = qIndex >= 0 ? url.slice(0, qIndex) : url;
  const query = qIndex >= 0 ? url.slice(qIndex) : '';
  const normalizedPath = path.replace(/\/{2,}/g, '/');
  if (normalizedPath !== path) {
    req.url = normalizedPath + query;
  }
  next();
});

// Helper Functions
async function getTargets(targets, supabase) {
  if (!supabase) return [];
  let query = supabase.from('schedule_items').select('*');
  if (targets.includes('all') || targets.includes('ALL')) {
    const { data } = await query;
    return data || [];
  }
  const ids = targets.filter(t => !t.toLowerCase().includes('class'));
  const classes = targets.filter(t => t.toLowerCase().includes('class')).map(t => {
      const match = t.match(/class\s+([a-zA-Z0-9]+)/i);
      return match ? match[1].toUpperCase() : null;
    }).filter(Boolean);
  if (ids.length > 0) query = query.in('id', ids);
  else if (classes.length > 0) {
    const dbClasses = classes.map(c => c === 'II' ? 'IIa' : c);
    query = query.in('class', dbClasses);
  } else return [];
  const { data } = await query;
  return data || [];
}

const toDateOrNull = (val) => (!val || val === 'TBD' || val === '') ? null : val;
const normalizeClass = (classVal) => {
  if (!classVal || classVal === 'TBD') return 'I';
  const valid = ['I', 'IIa', 'IIb', 'III'];
  if (valid.includes(classVal)) return classVal;
  if (classVal.includes('II')) return 'IIa';
  return 'I';
};

// Comprehensive Tool Execution
async function executeTool(name, input) {
  if (!supabase) return { error: "Database not connected" };
  console.log(`🔧 Executing Tool: ${name}`, JSON.stringify(input, null, 2));
  
  try {
    switch (name) {
      // ========== CREATE ==========
      case 'create_record': {
        const { id, product, class: deviceClass, type, frequency, start_date, end_date, due_date, status, writer, notes, combined_psur } = input;
        
        // Check if ID already exists
        const { data: existing } = await supabase.from('schedule_items').select('id').eq('id', id).single();
        if (existing) {
          return { error: `Record with ID "${id}" already exists. Use update_record to modify it.` };
        }
        
        const newRecord = {
          id,
          product: product || 'Unknown Product',
          class: normalizeClass(deviceClass),
          type: type || null,
          frequency: frequency || null,
          start_period: toDateOrNull(start_date),
          end_period: toDateOrNull(end_date),
          due_date: toDateOrNull(due_date),
          status: status || 'Not Started',
          writer: writer || null,
          notes: notes || null,
          combined_psur: combined_psur || null
        };
        
        const { error } = await supabase.from('schedule_items').insert(newRecord);
        if (error) throw error;
        
        return { 
          success: true, 
          message: `Created new record "${id}" for product "${product}".`,
          record: newRecord
        };
      }

      // ========== READ ==========
      case 'get_record': {
        const { id } = input;
        const { data, error } = await supabase.from('schedule_items').select('*').eq('id', id).single();
        if (error || !data) {
          return { error: `Record "${id}" not found.` };
        }
        return { 
          success: true, 
          record: {
            id: data.id,
            product: data.product,
            class: data.class,
            type: data.type,
            frequency: data.frequency,
            start_period: data.start_period,
            end_period: data.end_period,
            due_date: data.due_date,
            status: data.status,
            writer: data.writer,
            notes: data.notes,
            combined_psur: data.combined_psur
          }
        };
      }

      // ========== UPDATE (COMPREHENSIVE) ==========
      case 'update_record': {
        const { id, updates } = input;
        
        // Fetch current record
        const { data: current, error: fetchError } = await supabase.from('schedule_items').select('*').eq('id', id).single();
        if (fetchError || !current) {
          return { error: `Record "${id}" not found.` };
        }
        
        const dbUpdates = {};
        
        // Handle ID rename
        if (updates.new_id && updates.new_id !== id) {
          // Check if new_id already exists
          const { data: existingNew } = await supabase.from('schedule_items').select('id').eq('id', updates.new_id).single();
          if (existingNew) {
            return { error: `Cannot rename to "${updates.new_id}" - that ID already exists.` };
          }
          
          // Create new record with new ID and delete old one
          const newRecord = {
            ...current,
            id: updates.new_id,
            product: updates.product || current.product,
            class: updates.class ? normalizeClass(updates.class) : current.class,
            type: updates.type !== undefined ? updates.type : current.type,
            frequency: updates.frequency !== undefined ? updates.frequency : current.frequency,
            start_period: updates.start_period ? toDateOrNull(updates.start_period) : current.start_period,
            end_period: updates.end_period ? toDateOrNull(updates.end_period) : current.end_period,
            due_date: updates.due_date ? toDateOrNull(updates.due_date) : current.due_date,
            status: updates.status || current.status,
            writer: updates.writer !== undefined ? (updates.writer || null) : current.writer,
            notes: updates.notes !== undefined ? (updates.notes || null) : current.notes,
            combined_psur: updates.combined_psur !== undefined ? (updates.combined_psur || null) : current.combined_psur
          };
          
          // Delete old record and insert new one
          const { error: deleteError } = await supabase.from('schedule_items').delete().eq('id', id);
          if (deleteError) throw deleteError;
          
          const { error: insertError } = await supabase.from('schedule_items').insert(newRecord);
          if (insertError) throw insertError;
          
          return { 
            success: true, 
            message: `Renamed record from "${id}" to "${updates.new_id}" and applied updates.`,
            old_id: id,
            new_id: updates.new_id
          };
        }
        
        // Standard field updates (no ID change)
        if (updates.product) dbUpdates.product = updates.product;
        if (updates.class) dbUpdates.class = normalizeClass(updates.class);
        if (updates.type !== undefined) dbUpdates.type = updates.type;
        if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency;
        if (updates.start_period) dbUpdates.start_period = toDateOrNull(updates.start_period);
        if (updates.end_period) dbUpdates.end_period = toDateOrNull(updates.end_period);
        if (updates.due_date) dbUpdates.due_date = toDateOrNull(updates.due_date);
        if (updates.status) dbUpdates.status = updates.status;
        if (updates.writer !== undefined) dbUpdates.writer = updates.writer || null;
        if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
        if (updates.combined_psur !== undefined) dbUpdates.combined_psur = updates.combined_psur || null;
        
        if (Object.keys(dbUpdates).length === 0) {
          return { message: "No updates provided." };
        }
        
        const { error } = await supabase.from('schedule_items').update(dbUpdates).eq('id', id);
        if (error) throw error;
        
        return { 
          success: true, 
          message: `Updated record "${id}". Fields changed: ${Object.keys(dbUpdates).join(', ')}.`
        };
      }

      // ========== DELETE ==========
      case 'delete_record': {
        const { ids, confirm } = input;
        
        if (!confirm) {
          return { error: "Deletion requires confirm: true for safety." };
        }
        
        if (!ids || ids.length === 0) {
          return { error: "No IDs provided for deletion." };
        }
        
        const { data, error } = await supabase.from('schedule_items').delete().in('id', ids).select('id');
        if (error) throw error;
        
        const deletedCount = data ? data.length : 0;
        return { 
          success: true, 
          message: `Deleted ${deletedCount} record(s): ${ids.join(', ')}.`
        };
      }

      // ========== SEARCH ==========
      case 'search_records': {
        const { filters = {}, sort_by, sort_order, limit } = input;
        
        let query = supabase.from('schedule_items').select('*');
        
        // Apply filters
        if (filters.id_contains) {
          query = query.ilike('id', `%${filters.id_contains}%`);
        }
        if (filters.product_contains) {
          query = query.ilike('product', `%${filters.product_contains}%`);
        }
        if (filters.class) {
          query = query.eq('class', normalizeClass(filters.class));
        }
        if (filters.type_contains) {
          query = query.ilike('type', `%${filters.type_contains}%`);
        }
        if (filters.status) {
          query = query.eq('status', filters.status);
        }
        if (filters.writer_contains) {
          query = query.ilike('writer', `%${filters.writer_contains}%`);
        }
        if (filters.combined_psur) {
          query = query.eq('combined_psur', filters.combined_psur);
        }
        if (filters.due_before && isValid(parseISO(filters.due_before))) {
          query = query.lte('due_date', filters.due_before);
        }
        if (filters.due_after && isValid(parseISO(filters.due_after))) {
          query = query.gte('due_date', filters.due_after);
        }
        
        // Apply sorting
        if (sort_by) {
          const column = sort_by === 'due_date' ? 'due_date' : sort_by;
          query = query.order(column, { ascending: sort_order !== 'desc' });
        } else {
          query = query.order('id');
        }
        
        // Apply limit
        if (limit) {
          query = query.limit(limit);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        return { 
          success: true, 
          count: data?.length || 0,
          records: (data || []).map(r => ({
            id: r.id,
            product: r.product,
            class: r.class,
            type: r.type,
            frequency: r.frequency,
            start_period: r.start_period,
            end_period: r.end_period,
            due_date: r.due_date,
            status: r.status,
            writer: r.writer,
            notes: r.notes,
            combined_psur: r.combined_psur
          }))
        };
      }

      // ========== BULK OPERATION ==========
      case 'bulk_operation': {
        const { operation, targets, updates, confirm } = input;
        
        const items = await getTargets(targets, supabase);
        if (!items.length) return { message: "No matching items found." };
        
        const ids = items.map(i => i.id);
        
        switch (operation) {
          case 'update': {
            if (!updates || Object.keys(updates).length === 0) {
              return { error: "No updates provided for bulk update." };
            }
            
            const dbUpdates = {};
            if (updates.product) dbUpdates.product = updates.product;
            if (updates.class) dbUpdates.class = normalizeClass(updates.class);
            if (updates.type !== undefined) dbUpdates.type = updates.type;
            if (updates.frequency !== undefined) dbUpdates.frequency = updates.frequency;
            if (updates.start_period) dbUpdates.start_period = toDateOrNull(updates.start_period);
            if (updates.end_period) dbUpdates.end_period = toDateOrNull(updates.end_period);
            if (updates.due_date) dbUpdates.due_date = toDateOrNull(updates.due_date);
            if (updates.status) dbUpdates.status = updates.status;
            if (updates.writer !== undefined) dbUpdates.writer = updates.writer || null;
            if (updates.notes !== undefined) dbUpdates.notes = updates.notes || null;
            if (updates.combined_psur !== undefined) dbUpdates.combined_psur = updates.combined_psur || null;
            
            const { error } = await supabase.from('schedule_items').update(dbUpdates).in('id', ids);
            if (error) throw error;
            
            return { 
              success: true, 
              message: `Bulk updated ${ids.length} records. Fields: ${Object.keys(dbUpdates).join(', ')}.`
            };
          }
          
          case 'delete': {
            if (!confirm) {
              return { error: "Bulk deletion requires confirm: true." };
            }
            
            const { error } = await supabase.from('schedule_items').delete().in('id', ids);
            if (error) throw error;
            
            return { 
              success: true, 
              message: `Bulk deleted ${ids.length} records.`
            };
          }
          
          case 'duplicate': {
            const duplicated = [];
            for (const item of items) {
              const newId = `${item.id}_COPY`;
              const { error } = await supabase.from('schedule_items').insert({
                ...item,
                id: newId
              });
              if (!error) duplicated.push(newId);
            }
            return { 
              success: true, 
              message: `Duplicated ${duplicated.length} records.`,
              new_ids: duplicated
            };
          }
          
          default:
            return { error: `Unknown bulk operation: ${operation}` };
        }
      }

      // ========== LEGACY TOOLS ==========
      case 'update_status': {
        const { targets, status } = input;
        const items = await getTargets(targets, supabase);
        if (!items.length) return { message: "No matching items found." };
        const ids = items.map(i => i.id);
        const { error } = await supabase.from('schedule_items').update({ status }).in('id', ids);
        if (error) throw error;
        return { message: `Updated status to "${status}" for ${ids.length} items: ${ids.join(', ')}` };
      }
      
      case 'update_frequency': {
        const { targets, frequency } = input;
        const items = await getTargets(targets, supabase);
        if (!items.length) return { message: "No matching items found." };
        
        const ids = items.map(i => i.id);
        let warning = "";
        const freqLower = frequency.toLowerCase();
        
        const nonCompliantItems = items.filter(item => {
          const cls = item.class;
          if (cls === 'III' || cls === 'IIb') {
            if (freqLower.includes('2') || freqLower.includes('3') || freqLower.includes('5') || freqLower.includes('biennial')) {
              return true;
            }
          }
          if (cls === 'IIa') {
            if (freqLower.includes('3') || freqLower.includes('5')) {
              return true;
            }
          }
          return false;
        });
        
        if (nonCompliantItems.length > 0) {
          const affectedIds = nonCompliantItems.map(i => i.id).join(', ');
          warning = ` WARNING: Non-compliant frequency for ${affectedIds}. EU MDR/UKCA requires Annual for Class III/IIb and Biennial for Class IIa.`;
        }

        const { error } = await supabase.from('schedule_items').update({ frequency }).in('id', ids);
        if (error) throw error;
        
        return { message: `Updated frequency to "${frequency}" for ${ids.length} items.${warning}` };
      }
      
      case 'update_dates': {
        const { targets, start_date, end_date, due_date } = input;
        const items = await getTargets(targets, supabase);
        if (!items.length) return { message: "No matching items found." };
        
        const ids = items.map(i => i.id);
        const updates = {};
        
        if (start_date && isValid(parseISO(start_date))) updates.start_period = start_date;
        if (end_date && isValid(parseISO(end_date))) updates.end_period = end_date;
        if (due_date && isValid(parseISO(due_date))) updates.due_date = due_date;
        
        if (Object.keys(updates).length === 0) {
          return { error: "No valid dates provided." };
        }

        const { data, error } = await supabase
          .from('schedule_items')
          .update(updates)
          .in('id', ids)
          .select('id');
          
        if (error) throw error;
        const updatedCount = data ? data.length : 0;
        return { message: `Updated dates for ${updatedCount} items. Fields: ${Object.keys(updates).join(', ')}.` };
      }
      
      case 'advance_period': {
        const { targets } = input;
        const items = await getTargets(targets, supabase);
        if (!items.length) return { message: "No matching items found." };
        let count = 0;
        for (const item of items) {
          if (item.end_period && isValid(parseISO(item.end_period))) {
            const oldEnd = parseISO(item.end_period);
            const newStart = addDays(oldEnd, 1);
            const newStartStr = format(newStart, 'yyyy-MM-dd');
            
            let yearsToAdd = 1;
            if (item.frequency) {
              if (item.frequency.includes('2')) yearsToAdd = 2;
              else if (item.frequency.includes('3')) yearsToAdd = 3;
              else if (item.frequency.includes('0.5') || item.frequency.includes('6 months')) yearsToAdd = 0.5;
            } else {
              if (item.class === 'IIa') yearsToAdd = 2;
              if (item.class === 'I') yearsToAdd = 3;
            }
            
            const newEnd = subDays(addDays(newStart, yearsToAdd * 365), 1);
            const newEndStr = format(newEnd, 'yyyy-MM-dd');
            
            await supabase.from('schedule_items').update({
              start_period: newStartStr,
              end_period: newEndStr,
            }).eq('id', item.id);
            
            count++;
          }
        }
        return { message: `Advanced period for ${count} items. Due Date NOT updated (manual update required).` };
      }
      
      case 'query_schedule': 
        return { message: "Use search_records for advanced queries." };
      
      default: 
        return { error: `Tool "${name}" not implemented.` };
    }
  } catch (error) {
    console.error(`Tool execution error for ${name}:`, error);
    return { error: `Failed: ${error.message}` };
  }
}

// ========== API ENDPOINTS ==========

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    apiKeyConfigured: !!ANTHROPIC_API_KEY,
    openaiConfigured: !!OPENAI_API_KEY,
    supabaseConnected: !!supabase,
  });
});

app.get('/api/models', (req, res) => {
  const models = [
    // Anthropic Claude 4.5 (latest generation)
    { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5', recommended: true },
    { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (Fast)' },
    // Legacy Claude 3.x
    { id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet' },
    { id: 'claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet' },
    // OpenAI (fallback when Anthropic unavailable)
    { id: 'gpt-5-2', name: 'GPT-5.2', recommended: !!OPENAI_API_KEY },
    { id: 'gpt-5', name: 'GPT-5' },
    { id: 'gpt-4o', name: 'GPT-4o' },
    { id: 'gpt-4o-mini', name: 'GPT-4o mini' },
  ];
  res.json({ models });
});

app.get('/api/stats', (req, res) => res.json(stats));
app.post('/api/clear-session', (req, res) => res.json({ success: true }));
app.get('/api/supabase/status', (req, res) => res.json({ 
  configured: !!supabase, 
  url: SUPABASE_URL ? SUPABASE_URL.substring(0, 30) + '...' : null 
}));

// Schedule Endpoints
app.get('/api/schedule', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    const { data, error } = await supabase.from('schedule_items').select('*').order('id');
    if (error) throw error;
    const items = data.map(item => ({
      id: item.id, product: item.product, class: item.class || '', type: item.type || '',
      start: item.start_period || '', end: item.end_period || '', frequency: item.frequency || '',
      due: item.due_date || '', status: item.status || 'Not Started', writer: item.writer || '',
      notes: item.notes || '', combined_psur: item.combined_psur || ''
    }));
    res.json({ items });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

app.post('/api/schedule', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    const { items } = req.body;
    
    let autoIdCounter = 1;
    const processedItems = items.map(item => {
      let id = item.id;
      if (!id || id === 'TBD' || id.trim() === '') {
        const type = item.type || '';
        const prefix = type.toLowerCase().includes('ivd') ? 'PSUR' : 'PMSR';
        id = `${prefix}${String(autoIdCounter).padStart(4, '0')}`;
        autoIdCounter++;
      }
      return { ...item, id };
    });
    
    const dbItems = processedItems.map(item => ({
      id: item.id, 
      product: item.product || 'Unknown', 
      class: normalizeClass(item.class),
      type: item.type || null, 
      start_period: toDateOrNull(item.start), 
      end_period: toDateOrNull(item.end),
      frequency: item.frequency || null, 
      due_date: toDateOrNull(item.due), 
      status: item.status || 'Not Started',
      writer: item.writer || null,
      notes: item.notes || null,
      combined_psur: item.combined_psur || null
    }));
    
    const { error } = await supabase.from('schedule_items').upsert(dbItems, { onConflict: 'id' });
    if (error) throw error;
    res.json({ success: true, saved: dbItems.length, skipped: 0 });
  } catch (error) { 
    res.status(500).json({ error: error.message }); 
  }
});

// Delete single schedule item
app.delete('/api/schedule/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('schedule_items')
      .delete()
      .eq('id', id)
      .select('id');
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }
    
    console.log(`🗑️ Deleted item: ${id}`);
    res.json({ success: true, deleted: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete schedule items
app.post('/api/schedule/bulk-delete', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Supabase not configured' });
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No IDs provided' });
    }
    
    const { data, error } = await supabase
      .from('schedule_items')
      .delete()
      .in('id', ids)
      .select('id');
    
    if (error) throw error;
    
    const deletedCount = data ? data.length : 0;
    console.log(`🗑️ Bulk deleted ${deletedCount} items`);
    res.json({ success: true, deleted: deletedCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Claude Chat API with Tool Execution Loop
app.post('/api/claude', async (req, res) => {
  stats.totalRequests++;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const { model, max_tokens, temperature, system, messages, tools } = req.body;

    if (!model || !messages) {
      return res.status(400).json({ error: { type: 'invalid_request', message: 'Missing fields' } });
    }

    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: { type: 'config_error', message: 'ANTHROPIC_API_KEY not configured' } });
    }

    console.log(`\n[${requestId}] 📤 API Request: ${model}`);

    // Tool Execution Loop
    let currentMessages = [...messages];
    let isComplete = false;
    let turnCount = 0;
    let finalMessage = null;

    while (!isComplete && turnCount < 10) {
      turnCount++;
      
      let apiResponse;
      try {
        apiResponse = await anthropic.messages.create({
          model,
          max_tokens: max_tokens || 4096,
          messages: currentMessages,
          system,
          temperature,
          tools
        });
      } catch (err) {
        // If Anthropic is unavailable due to credits/auth, fallback to OpenAI (if configured)
        if (isAuthOrCreditsError(err)) {
          console.warn(`[${requestId}] ⚠️ Anthropic unavailable, attempting OpenAI fallback: ${err.message}`);
          const openAIResult = await runOpenAIWithTools({ model, max_tokens, temperature, system, messages: currentMessages, tools });
          stats.successfulRequests++;
          console.log(`[${requestId}] ✅ Complete via OpenAI (${openAIResult.turnCount} turns)`);
          return res.json(openAIResult);
        }
        throw err;
      }

      if (apiResponse.stop_reason === 'tool_use') {
        console.log(`[${requestId}] 🛠️ Tool Use (turn ${turnCount})`);
        currentMessages.push({ role: 'assistant', content: apiResponse.content });

        const toolResults = [];
        for (const contentBlock of apiResponse.content) {
          if (contentBlock.type === 'tool_use') {
            console.log(`[${requestId}]   -> ${contentBlock.name}`);
            const result = await executeTool(contentBlock.name, contentBlock.input);
            toolResults.push({
              type: 'tool_result', 
              tool_use_id: contentBlock.id, 
              content: JSON.stringify(result)
            });
          }
        }
        currentMessages.push({ role: 'user', content: toolResults });
      } else {
        finalMessage = apiResponse;
        isComplete = true;
      }
    }

    stats.successfulRequests++;
    console.log(`[${requestId}] ✅ Complete (${turnCount} turns)`);
    res.json(finalMessage);

  } catch (error) {
    stats.failedRequests++;
    console.error(`[${requestId}] ❌ Error:`, error);
    const status =
      error && error.code === 'OPENAI_NOT_CONFIGURED' ? 503 :
      error && typeof error.status === 'number' ? error.status :
      500;
    res.status(status).json({
      error: {
        type: error && error.constructor ? error.constructor.name : 'Error',
        message: error && error.message ? String(error.message) : 'Unknown error',
      }
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`  skej Backend Server`);
  console.log(`========================================`);
  console.log(`  URL:      http://localhost:${PORT}`);
  console.log(`  Claude:   ${ANTHROPIC_API_KEY ? 'Enabled' : 'Disabled'}`);
  console.log(`  Supabase: ${supabase ? 'Connected' : 'Not configured'}`);
  console.log(`========================================\n`);
});
