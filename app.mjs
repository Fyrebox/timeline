import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { connectMongo } from './db/mongo.mjs';
import pagesRouter from './routes/pages.mjs';
import eventsRouter from './routes/events.mjs';
import mcpRouter from './routes/mcp.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';

const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use('/', pagesRouter);
app.use('/events', eventsRouter);
app.use('/mcp', mcpRouter);

// Basic error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send('Something went wrong.');
});

// Try Mongo (non-fatal in Phase 1), then start.
await connectMongo(MONGODB_URI);

app.listen(PORT, () => {
  console.log(`[timeline] http://localhost:${PORT}`);
});
