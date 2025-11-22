# PulseOps Setup Guide

## 🔑 Setting Up Your Anthropic API Key

The AI agent requires an Anthropic API key to function. Follow these steps:

### 1. Get Your API Key

If you don't have an Anthropic API key yet:

1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys section
4. Create a new API key
5. Copy the key (it starts with `sk-ant-`)

### 2. Add API Key to Your Project

**Option A: Using the command line**

```bash
# Navigate to your project directory
cd /Users/yash/Documents/project_pyn

# Create or update .env file with your API key
echo "ANTHROPIC_API_KEY=sk-ant-your-actual-key-here" > .env
echo "POSTMAN_FLOW_URL=http://localhost:3000/fake-flow" >> .env
echo "PORT=3000" >> .env
```

**Option B: Manually edit .env file**

1. Open or create `.env` file in the project root
2. Add these lines:

```env
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
POSTMAN_FLOW_URL=http://localhost:3000/fake-flow
PORT=3000
```

3. Replace `sk-ant-your-actual-key-here` with your real API key

### 3. Verify Setup

Start the server:

```bash
npm run dev
```

You should see in the console:

```
🌍 Environment:
  POSTMAN_FLOW_URL: http://localhost:3000/fake-flow (default)
  ANTHROPIC_API_KEY: ✓ set
```

If you see `✗ NOT SET` instead of `✓ set`, the API key is not loaded correctly.

### 4. Test the AI Agent

Open your browser to http://localhost:3000 and:

1. Click "➕ Create Test Incident" 
2. Click "🤖 Plan Actions with AI" on the incident
3. The AI should analyze and generate action plans

If you see errors about "AI service not configured", the API key is missing.

## 🐛 Troubleshooting

### Error: "ANTHROPIC_API_KEY is not set"

**Solution:** Make sure your `.env` file exists in the project root and contains the API key.

**Check:**
```bash
# From your project directory
cat .env
```

You should see:
```
ANTHROPIC_API_KEY=sk-ant-...
```

### Server doesn't pick up .env changes

**Solution:** Restart the server after editing `.env`:

1. Stop the server (Ctrl+C)
2. Start again: `npm run dev`

### Still getting 500 errors

**Check the server console output** - it will show detailed error messages. Common issues:

1. Invalid API key format
2. Network issues
3. API quota exceeded
4. Missing dependencies

## 💰 API Costs

Each AI planning call uses Claude 3.5 Sonnet. Typical costs:
- Small incident: ~$0.01-0.02 per plan
- The autonomous system ticks every 10 seconds but only calls the AI when creating incidents

**Tip:** For development/testing without costs, you can temporarily disable auto-planning by commenting out the `planIncident` call in `src/server.ts`.

## 🔒 Security

**Important:** Never commit your `.env` file to git! It's already in `.gitignore` to prevent this.

If you accidentally expose your API key:
1. Delete it immediately from the Anthropic console
2. Generate a new one
3. Update your `.env` file

---

Need help? Check the main README.md or the server console for detailed error messages.

