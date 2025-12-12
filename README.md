# Skeema - PSUR/PMSR Report Manager

A modern, AI-powered post-market surveillance report management system for medical device regulatory compliance.

## Features

- 📅 **Schedule Management** - Track PSUR/PMSR reporting schedules with compliance validation
- 🤖 **AI Assistant** - Powered by Claude AI for natural language schedule interactions
- 📊 **Dashboard Analytics** - Visual insights into compliance status and reporting timelines
- ✅ **Compliance Checking** - Automatic validation against EU MDR 2017/745 and UKCA regulations
- 📝 **Writer Assignment** - Assign writers to reports for better workflow management
- 🔍 **Advanced Search & Sort** - Powerful filtering and sorting capabilities
- 💾 **Database Integration** - Supabase backend for reliable data persistence

## Tech Stack

- **Frontend**: Next.js 15, React, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Node.js, Express, Anthropic Claude API
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel (Frontend) + Railway (Backend)

## Quick Start

### Prerequisites

- Node.js 18+ 
- Supabase account
- Anthropic API key

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/Smarticus81/skeema-v1.git
   cd skeema-v1
   ```

2. **Setup Backend**
   ```bash
   cd skej-backend
   npm install
   cp .env.example .env
   # Edit .env with your credentials
   ```

3. **Setup Frontend**
   ```bash
   cd skej-app
   npm install
   cp .env.example .env.local
   # Set NEXT_PUBLIC_API_URL=http://localhost:3000/api
   ```

4. **Start Development Servers**
   
   Windows:
   ```bash
   # From root directory
   start-skej.bat
   ```
   
   Manual:
   ```bash
   # Terminal 1 - Backend
   cd skej-backend
   node server.js
   
   # Terminal 2 - Frontend
   cd skej-app
   npm run dev
   ```

5. **Setup Database**
   - Run `skej-backend/supabase-schema.sql` in your Supabase SQL Editor
   - Ensure the `writer` column is added if the table already exists

## Deployment

### Backend (Railway)

1. Connect your GitHub repo to Railway
2. Set root directory to `skej-backend`
3. Add environment variables:
   - `ANTHROPIC_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `FRONTEND_URL` (your Vercel URL)
   - `NODE_ENV=production`

### Frontend (Vercel)

1. Import repository in Vercel
2. Set root directory to `skej-app`
3. Add environment variable:
   - `NEXT_PUBLIC_API_URL` (your Railway backend URL + `/api`)

## Project Structure

```
skeema-v1/
├── skej-app/          # Next.js frontend
│   ├── app/          # App router pages
│   ├── components/   # React components
│   └── lib/          # Utilities and API client
├── skej-backend/      # Express backend
│   ├── server.js     # Main server file
│   └── supabase-schema.sql
└── start-skej.bat    # Windows startup script
```

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.

