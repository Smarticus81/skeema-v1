export const CHAT_SYSTEM_INSTRUCTION = `You are skej, an expert PSUR/PMSR Report Manager assistant for medical device post-market surveillance. You possess deep regulatory knowledge of EU MDR 2017/745, UK SI 2024/1368 (UKCA), and MDCG 2022/21 guidance.

CORE EXPERTISE:

You understand device classification (Class I-III), surveillance period frequencies, reporting timelines, and regulatory requirements. Class III/IIb devices require annual PSURs, Class IIa biennial, and Class I PMSR every 3-5 years.

CONVERSATIONAL INTELLIGENCE:

Be concise and direct. When users request changes to the schedule, YOU MUST IMMEDIATELY use the available tools to execute them - DO NOT just describe what you would do, ACTUALLY CALL THE TOOLS. Understand natural language requests and call the appropriate tool function with the correct parameters.

CRITICAL: When a user asks to update multiple records:
1. IMMEDIATELY call bulk_operation or multiple update_record calls
2. Execute the changes RIGHT NOW, not later
3. After executing, confirm what was actually changed
4. NEVER say "I will" or "I can" - DO IT IMMEDIATELY

COMPREHENSIVE DATABASE TOOLS:
You have FULL database access to create, read, update, and delete records:

- create_record: Create new PSUR/PMSR records
- get_record: Retrieve full details of a specific record
- update_record: Update ANY field(s) on a record including ID
- delete_record: Remove records from the database
- search_records: Advanced search and filtering
- bulk_operation: Perform batch operations on multiple records
- update_dates: Update start, end, or due dates
- update_frequency: Set reporting frequency
- update_status: Change the status of records
- advance_period: Move records to the next reporting period

SEMANTIC UNDERSTANDING:
You can see relationships between items:
- Items grouped by class share regulatory requirements
- Items of the same type may have related surveillance needs
- Overlapping periods indicate concurrent reporting obligations
- Timeline clusters show when multiple reports are due in the same timeframe
- Status distribution reveals workload and compliance state

Use this relational understanding to provide intelligent recommendations and identify patterns.

ACTION EXECUTION PROTOCOL:
When a user asks to make changes:
1. STOP talking and EXECUTE the tools immediately
2. Call bulk_operation for multiple records or multiple update_record calls
3. After execution completes, CONFIRM what was actually changed with specific details
4. NEVER use phrases like "I will", "I can", "I should", "Let me" - JUST DO IT NOW
5. If you find yourself describing what to do instead of doing it, STOP and call the tools

Example BAD response: "I found 5 records that need updating. Let me update them now."
Example GOOD response: [calls bulk_operation tool immediately] "Updated 5 records: PSUR001, PSUR002, PSUR003, PSUR004, PSUR005. Changed status to 'Complete' and set due dates to 2026-03-15."

Use tools to modify the schedule when requested. Provide brief, natural language confirmations after executing actions.`;

export const CHAT_TOOLS = [
  {
    name: "create_record",
    description: "Create a new PSUR/PMSR record in the database.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Unique identifier for the record (e.g., PSUR001, PMS019R)",
        },
        product: {
          type: "string",
          description: "Product name",
        },
        class: {
          type: "string",
          enum: ["I", "IIa", "IIb", "III"],
          description: "Device classification",
        },
        type: {
          type: "string",
          description: "Report type (e.g., IVD PSUR, MDR PMSR)",
        },
        frequency: {
          type: "string",
          description: "Reporting frequency (e.g., 1 year, 2 years)",
        },
        start_date: {
          type: "string",
          description: "Start of reporting period (YYYY-MM-DD)",
        },
        end_date: {
          type: "string",
          description: "End of reporting period (YYYY-MM-DD)",
        },
        due_date: {
          type: "string",
          description: "Report due date (YYYY-MM-DD)",
        },
        status: {
          type: "string",
          description: "Current status (e.g., Not Started, In Progress, Complete)",
        },
        writer: {
          type: "string",
          description: "Assigned writer/owner for this record",
        },
        notes: {
          type: "string",
          description: "Notes that must be considered during inference and decision making",
        },
        combined_psur: {
          type: "string",
          description: "Optional combined PSUR grouping key. Multiple records with the same value are treated as one combined PSUR.",
        },
      },
      required: ["id", "product"],
    },
  },
  {
    name: "get_record",
    description: "Retrieve full details of a specific record by ID.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "The record ID to retrieve",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "update_record",
    description: "Update ANY field(s) on a record, including renaming the ID. This is the most flexible update tool.",
    input_schema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Current record ID to update",
        },
        updates: {
          type: "object",
          description: "Object containing fields to update. Can include: new_id, product, class, type, frequency, start_period, end_period, due_date, status, writer, notes, combined_psur",
          properties: {
            new_id: { type: "string", description: "New ID to rename the record to" },
            product: { type: "string" },
            class: { type: "string", enum: ["I", "IIa", "IIb", "III"] },
            type: { type: "string" },
            frequency: { type: "string" },
            start_period: { type: "string" },
            end_period: { type: "string" },
            due_date: { type: "string" },
            status: { type: "string" },
            writer: { type: "string" },
            notes: { type: "string" },
            combined_psur: { type: "string" },
          },
        },
      },
      required: ["id", "updates"],
    },
  },
  {
    name: "delete_record",
    description: "Delete one or more records from the database. Use with caution.",
    input_schema: {
      type: "object",
      properties: {
        ids: {
          type: "array",
          items: { type: "string" },
          description: "Array of record IDs to delete",
        },
        confirm: {
          type: "boolean",
          description: "Must be true to confirm deletion",
        },
      },
      required: ["ids", "confirm"],
    },
  },
  {
    name: "search_records",
    description: "Search and filter records with advanced criteria.",
    input_schema: {
      type: "object",
      properties: {
        filters: {
          type: "object",
          properties: {
            id_contains: { type: "string", description: "ID contains this string" },
            product_contains: { type: "string", description: "Product name contains" },
            class: { type: "string", description: "Exact class match" },
            type_contains: { type: "string", description: "Type contains" },
            status: { type: "string", description: "Exact status match" },
            writer_contains: { type: "string", description: "Writer contains" },
            combined_psur: { type: "string", description: "Exact combined PSUR grouping key" },
            due_before: { type: "string", description: "Due date before (YYYY-MM-DD)" },
            due_after: { type: "string", description: "Due date after (YYYY-MM-DD)" },
          },
        },
        sort_by: {
          type: "string",
          enum: ["id", "product", "class", "due_date", "status", "writer"],
          description: "Field to sort by",
        },
        sort_order: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order",
        },
        limit: {
          type: "number",
          description: "Maximum records to return",
        },
      },
      required: [],
    },
  },
  {
    name: "bulk_operation",
    description: "Perform batch operations on multiple records at once.",
    input_schema: {
      type: "object",
      properties: {
        operation: {
          type: "string",
          enum: ["update", "delete", "duplicate"],
          description: "The operation to perform",
        },
        targets: {
          type: "array",
          items: { type: "string" },
          description: "Array of record IDs, or special values like 'all', 'Class III', 'Class IIa'",
        },
        updates: {
          type: "object",
          description: "For update operation: fields to update on all targets",
        },
        confirm: {
          type: "boolean",
          description: "Must be true for destructive operations",
        },
      },
      required: ["operation", "targets"],
    },
  },
  {
    name: "update_dates",
    description:
      "Update the start, end, or due dates for one or more records. Updates are independent - changing one date does NOT automatically change others unless explicitly requested.",
    input_schema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: { type: "string" },
          description:
            'Array of IDs to update, or "all".',
        },
        start_date: {
          type: "string",
          description: 'New Start Date (YYYY-MM-DD)',
        },
        end_date: {
          type: "string",
          description: 'New End Date (YYYY-MM-DD)',
        },
        due_date: {
          type: "string",
          description: 'New Due Date (YYYY-MM-DD)',
        },
      },
      required: ["targets"],
    },
  },
  {
    name: "update_frequency",
    description:
      "Update the reporting frequency for one or more PSUR/PMSR records. System will validate against EU MDR/UKCA compliance rules.",
    input_schema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: { type: "string" },
          description: 'Array of PSUR/PMSR IDs or filter like "Class IIa"',
        },
        frequency: {
          type: "string",
          description: 'New frequency, e.g., "1 year", "2 years", "3 years"',
        },
      },
      required: ["targets", "frequency"],
    },
  },
  {
    name: "update_status",
    description: "Update the status of one or more PSUR/PMSR records.",
    input_schema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: { type: "string" },
          description: "Array of PSUR/PMSR IDs to update",
        },
        status: {
          type: "string",
          description: 'New status value, e.g., "Complete", "In Progress", "Not Started"',
        },
      },
      required: ["targets", "status"],
    },
  },
  {
    name: "advance_period",
    description:
      "Advance one or more PSUR/PMSR records to the next reporting period based on regulatory frequency rules. Note: Due date is NOT automatically updated.",
    input_schema: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of PSUR/PMSR IDs to advance. Can also be filtered by class or type in natural language.",
        },
      },
      required: ["targets"],
    },
  },
];
