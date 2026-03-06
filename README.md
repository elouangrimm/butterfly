# Butterfly

Minimal, feature-rich Pronote web client powered by the [Pawnote](https://github.com/LiterateInk/Pawnote.js) API.

## Features

### Notes
- Period selector (T1 / T2 / T3 / annual)
- Running weighted average chart over time
- Subject averages vs class averages (horizontal bar chart)
- Per-subject grade history chart with class average overlay
- Clickable subject cards with student / class / max breakdown
- Full grades table with sort, color-coded badges, best-in-class ⭐ indicators
- Above-average counter (percentage of grades beating the class mean)

### Emploi du temps
- Weekly grid from 7h to 20h with accurate time-based positioning
- Today column highlight + live current-time red line
- Week navigation (prev / next / today)
- Lesson detail on hover (room, teacher, groups, status)
- Cancelled class indicators
- Weekly stats: lesson count, cancelled count, total hours, subjects

### Devoirs
- Load by week range
- Group by due date
- Filter: All / Pending / Done / Overdue
- Filter by subject (chip bar)
- Mark as done (persisted in localStorage)
- Return type indicators (paper, file upload, etc.)
- Attachment links

### Export
| Format | Description | Best for |
|--------|-------------|----------|
| **JSON** | Full structured data dump | LLMs, scripts, raw analysis |
| **Markdown** | Human-readable report with tables | LLMs, notes, documentation |
| **HTML** | Self-contained styled report | Printing, sharing, archiving |

## Architecture

```
butterfly/
├── api/
│   ├── login.js          # POST: authenticate, return token + periods
│   ├── overview.js       # POST: grades overview for a period
│   ├── timetable.js      # POST: timetable for a week number
│   └── assignments.js    # POST: assignments across week range
├── grades/
│   └── index.html        # Notes dashboard with Chart.js
├── schedule/
│   └── index.html        # Weekly timetable grid
├── assignments/
│   └── index.html        # Homework tracker
├── index.html            # Login page
├── style.css             # Shared design system
├── app.js                # Shared utilities (auth, API, export)
├── package.json
├── vercel.json
└── README.md
```

## Session flow

1. User enters Pronote URL, username, password
2. `POST /api/login` authenticates via `loginCredentials`, returns `{token, username, url, kind, deviceUUID}` + period list
3. Credentials stored in `sessionStorage`, `deviceUUID` persisted in `localStorage`
4. Each subsequent API call sends the auth object; server uses `loginToken` (stateless, no server-side session)

## Usage

Install dependencies:
```bash
npm install
```

Run locally with Vercel:
```bash
npm run dev
```

Navigate to `http://localhost:3000`.

## Deployment

Deployed on [Vercel](https://vercel.com). Push to trigger automatic deployment.

The `api/` directory is served as Vercel Serverless Functions (Node.js runtime, ES modules).

## Tech Stack

- Plain HTML5
- CSS3 (custom properties, no preprocessor)
- Vanilla JavaScript (ES6+)
- [Chart.js v4](https://www.chartjs.org/) (CDN, grades charts)
- [Pawnote](https://github.com/LiterateInk/Pawnote.js) (Pronote API wrapper)
- [Vercel](https://vercel.com) (serverless functions + static hosting)

## Design System

This project uses [Elouan's Design System](https://e5g.dev/css): dark-first, zero border-radius, flat UI, stone neutral palette, monospace headings.

## License

MIT
