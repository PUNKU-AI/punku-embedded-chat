# Punku Embedded Chat Widget

Embeddable chat widget built with React and bundled as a web component using `@r2wc/react-to-web-component`.

## Quick Reference

### Commands
```bash
npm start          # Start development server
npm test           # Run tests in watch mode
npm run build      # Build for production (React + Webpack bundle)
npm run build:react   # Build React app only
npm run build:bundle  # Bundle with Webpack only
```

### Project Structure
```
src/
├── index.tsx                    # Entry point, web component registration
├── chatWidget/                  # Main widget component
│   ├── index.tsx               # ChatWidget main component
│   ├── utils.ts                # Widget utilities (position, animation, language detection)
│   ├── chatTrigger/            # Floating trigger button
│   ├── chatWindow/             # Chat window container
│   │   └── chatMessage/        # Individual message component
│   └── components/             # Shared components (ConfirmationModal)
├── chatPlaceholder/            # Loading placeholder component
├── controllers/                # API functions (sendMessage, streamMessage, sendFeedback)
├── utils/
│   └── sessionStorage.ts       # Session persistence with TTL
├── types/                      # TypeScript type definitions
├── translations/               # i18n translations
└── components/                 # Shared UI components (PunkuLogo, LanguageSwitcher)
```

## Architecture

### Web Component Integration
The widget is converted to a web component via `@r2wc/react-to-web-component` and can be embedded in any webpage:
```html
<punku-chat-widget
  host_url="https://api.example.com"
  flow_id="your-flow-id"
  input_type="chat"
  output_type="chat"
></punku-chat-widget>
```

### Session Management
- Sessions are stored in localStorage with domain + flow_id scoping
- Default TTL: 24 hours absolute, 30 minutes idle
- Configurable via `ttl_hours` and `idle_expiration_hours` props

### Theming
Available themes: `default`, `dark`, `ocean`, `aurora`, `punku-ai-bookingkit`, `swarovski`

## Testing

### Running Tests
```bash
npm test                           # Watch mode
npm test -- --watchAll=false       # Single run
npm test -- --coverage             # With coverage
npm test -- sessionStorage.test.ts # Specific file
```

### Test Structure
- Tests located alongside source files as `*.test.ts` or `*.test.tsx`
- Uses Jest + React Testing Library
- Mocks configured in `src/__mocks__/` and `package.json` Jest config

### Key Testing Patterns
- Mock ESM modules in `package.json` `transformIgnorePatterns`
- Use `jest.mock()` before imports for module mocking
- localStorage mocking requires stable object references (don't reassign)

## Development Guidelines

### Security
- **NEVER** commit sensitive information to `index.html` or any other file (API keys, flow IDs, host URLs with credentials)
- Use placeholder values like `your-flow-id` or `https://api.example.com` in examples and documentation
- Real configuration values should only exist in deployment environments, not in the repository

### Adding New Components
1. Create component in appropriate directory
2. Add corresponding `.test.tsx` file
3. Export from parent index if needed

### API Integration
- All API calls go through `src/controllers/index.ts`
- Supports both sync (`sendMessage`) and streaming (`streamMessage`) modes
- Session ID managed via React ref passed to controllers

### Props Reference
Key widget props:
- `host_url` (required): Backend API URL
- `flow_id` (required): Flow identifier
- `input_type` / `output_type` (required): Message types
- `theme`: Visual theme
- `default_language`: UI language (en, de, es, fr, it, pt)
- `start_open`: Open widget on load
- `session_id`: Override session ID
- `ttl_hours` / `idle_expiration_hours`: Session expiration config
