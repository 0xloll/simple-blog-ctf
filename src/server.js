const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const { DatabaseSync } = require('node:sqlite');

const app = express();
const port = process.env.PORT || 3000;
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'blog.sqlite'));
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const textInput = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;

db.exec('PRAGMA foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'USER');
CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, author_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(author_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, author_id TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(post_id) REFERENCES posts(id), FOREIGN KEY(author_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS comment_revisions (id TEXT PRIMARY KEY, comment_id TEXT NOT NULL, body TEXT NOT NULL, revision_number INTEGER NOT NULL, created_at TEXT NOT NULL, FOREIGN KEY(comment_id) REFERENCES comments(id));
CREATE TABLE IF NOT EXISTS likes (user_id TEXT NOT NULL, post_id TEXT NOT NULL, PRIMARY KEY(user_id, post_id), FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(post_id) REFERENCES posts(id));
`);
if (!db.prepare("SELECT 1 FROM pragma_table_info('posts') WHERE name = 'cover_url'").get()) db.exec('ALTER TABLE posts ADD COLUMN cover_url TEXT');

function seed() {
  if (db.prepare('SELECT COUNT(*) count FROM users').get().count) return;
  const addUser = db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)');
  const users = {};
  for (const [username, email, password, role] of [
    ['admin', 'admin@example.test', 'AdminPass123!', 'ADMIN'],
    ['alice', 'alice@example.test', 'AlicePass123!', 'USER'],
    ['bob', 'bob@example.test', 'BobPass123!', 'USER'],
    ['charlie', 'charlie@example.test', 'CharliePass123!', 'USER']
  ]) { users[username] = id(); addUser.run(users[username], username, email, bcrypt.hashSync(password, 10), role); }
  const addPost = db.prepare('INSERT INTO posts VALUES (?, ?, ?, ?, ?)');
  const posts = [];
  for (let i = 1; i <= 10; i++) { const postId = id(); posts.push(postId); addPost.run(postId, i % 2 ? users.admin : users.alice, `A Practical Web Note #${i}`, `This is sample article ${i}. It contains ordinary blog content for exploration.`, now(), `/images/cover-${(i - 1) % 3 + 1}.svg`); }
  const commentId = id();
  db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?)').run(commentId, posts[0], users.admin, 'The updated public version of this comment is harmless.', now(), now());
  db.prepare('INSERT INTO comment_revisions VALUES (?, ?, ?, ?, ?)').run(id(), commentId, 'Internal deployment note: FLAG{comment_history_authorization}', 1, now());
  db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?)').run(id(), posts[0], users.alice, 'Nice article!', now(), now());
}
seed();
db.prepare("UPDATE posts SET cover_url = '/images/cover-' || ((rowid - 1) % 3 + 1) || '.svg' WHERE cover_url IS NULL").run();
if (db.prepare('SELECT COUNT(*) count FROM comments').get().count < 8) {
  const demoUsers = db.prepare('SELECT id, username FROM users WHERE username IN (?, ?, ?)').all('alice', 'bob', 'charlie');
  const demoPosts = db.prepare('SELECT id FROM posts ORDER BY rowid').all();
  const messages = ['Clear explanation, thanks for sharing.', 'I tried this approach and it worked nicely.', 'This is a useful note for anyone getting started.', 'Looking forward to the next article.', 'The example makes the idea easy to follow.', 'Great perspective on a familiar topic.'];
  for (let i = 0; i < messages.length; i++) db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?)').run(id(), demoPosts[(i + 1) % demoPosts.length].id, demoUsers[i % demoUsers.length].id, messages[i], now(), now());
}
if (!db.prepare("SELECT 1 FROM comments WHERE body LIKE 'Community note:%' LIMIT 1").get()) {
  const demoUsers = db.prepare('SELECT id, username FROM users WHERE username IN (?, ?, ?)').all('alice', 'bob', 'charlie');
  const demoPosts = db.prepare('SELECT id FROM posts ORDER BY rowid').all();
  const extraComments = [
    [0, 0, 'Community note: The checklist at the end was especially useful.'],
    [0, 1, 'Community note: I bookmarked this for later.'],
    [1, 2, 'Community note: The second example made the idea click.'],
    [2, 0, 'Community note: Would love to see a follow-up on this topic.'],
    [3, 1, 'Community note: Simple and practical explanation.'],
    [4, 2, 'Community note: This is a good reference for beginners.'],
    [5, 0, 'Community note: The details here are easy to miss.'],
    [6, 1, 'Community note: Nice balance between theory and practice.'],
    [7, 2, 'Community note: I had a similar experience recently.'],
    [8, 0, 'Community note: The final takeaway is worth remembering.'],
    [9, 1, 'Community note: Looking forward to more notes like this.']
  ];
  for (const [postIndex, userIndex, body] of extraComments) db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?)').run(id(), demoPosts[postIndex].id, demoUsers[userIndex].id, body, now(), now());
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(express.json({ limit: '16kb' }));
app.use((req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'"); next(); });
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({ name: 'papertrail.sid', secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'), resave: false, saveUninitialized: false, cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 2 * 60 * 60 * 1000 } }));
app.use((req, res, next) => { res.locals.user = req.session.user || null; next(); });
const requireLogin = (req, res, next) => { if (req.session.user) return next(); if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Authentication required' }); return res.redirect('/register'); };
const findUser = userId => db.prepare('SELECT id, username, email, role FROM users WHERE id = ?').get(userId);
const authWindow = new Map();
const authRateLimit = (req, res, next) => { const key = req.ip || 'local'; const current = authWindow.get(key) || { count: 0, started: Date.now() }; if (Date.now() - current.started > 60_000) { current.count = 0; current.started = Date.now(); } current.count += 1; authWindow.set(key, current); if (current.count > 30) return res.status(429).json({ error: 'Too many authentication attempts' }); next(); };
setInterval(() => { for (const [key, value] of authWindow) if (Date.now() - value.started > 120_000) authWindow.delete(key); }, 120_000).unref();
app.get('/health', (req, res) => res.json({ ok: true }));

const postWithStats = postId => db.prepare(`SELECT posts.*, users.username, (SELECT COUNT(*) FROM likes WHERE post_id = posts.id) like_count FROM posts JOIN users ON users.id = posts.author_id WHERE posts.id = ?`).get(postId);
const commentsForPost = postId => db.prepare('SELECT comments.*, users.username FROM comments JOIN users ON users.id = comments.author_id WHERE post_id = ? ORDER BY comments.created_at').all(postId);

// JSON API used by the browser UI. These routes are intentionally easy to observe in Burp.
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/auth/register', authRateLimit, (req, res) => { const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''; const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''; const password = req.body?.password; if (!/^[a-zA-Z0-9_]{3,24}$/.test(username) || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Invalid registration data' }); try { const userId = id(); db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?)').run(userId, username, email, bcrypt.hashSync(password, 10), 'USER'); req.session.destroy(() => res.status(201).json({ registered: true, loginRequired: true })); } catch { res.status(409).json({ error: 'Username or email is already in use' }); } });
app.post('/api/auth/login', authRateLimit, (req, res) => { const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''; const password = req.body?.password; const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email); if (!row || typeof password !== 'string' || password.length > 128 || !bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ error: 'Invalid email or password' }); req.session.regenerate(err => { if (err) return res.status(500).json({ error: 'Unable to start session' }); req.session.user = findUser(row.id); res.json({ user: req.session.user }); }); });
app.post('/api/auth/logout', (req, res) => req.session.destroy(() => res.json({ loggedOut: true })));
app.get('/api/posts', requireLogin, (req, res) => res.json({ posts: db.prepare(`SELECT posts.id, posts.title, posts.body, posts.cover_url, posts.created_at, users.username, (SELECT COUNT(*) FROM comments WHERE post_id = posts.id) comment_count, (SELECT COUNT(*) FROM likes WHERE post_id = posts.id) like_count FROM posts JOIN users ON users.id = posts.author_id ORDER BY posts.created_at DESC`).all() }));
app.get('/api/posts/:id', requireLogin, (req, res) => { if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Post not found' }); const post = postWithStats(req.params.id); if (!post) return res.status(404).json({ error: 'Post not found' }); const comments = commentsForPost(post.id).map(c => { const owner = c.author_id === req.session.user.id; return { id: c.id, post_id: c.post_id, author_id: c.author_id, username: c.username, body: c.body, created_at: c.created_at, updated_at: c.updated_at, ...(owner ? { canEdit: true, canDelete: true, canViewHistory: true } : {}) }; }); const liked = !!db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.session.user.id, post.id); res.json({ post, comments, liked }); });
app.post('/api/posts/:id/comments', requireLogin, (req, res) => { if (!isUuid(req.params.id) || !postWithStats(req.params.id)) return res.status(404).json({ error: 'Post not found' }); const body = textInput(req.body?.body, 4000); if (!body) return res.status(400).json({ error: 'Comment body is required' }); const commentId = id(); db.prepare('INSERT INTO comments VALUES (?, ?, ?, ?, ?, ?)').run(commentId, req.params.id, req.session.user.id, body, now(), now()); res.status(201).json({ comment: db.prepare('SELECT comments.*, users.username FROM comments JOIN users ON users.id = comments.author_id WHERE comments.id = ?').get(commentId) }); });
app.patch('/api/comments/:id', requireLogin, (req, res) => { if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Comment not found' }); const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id); if (!comment || comment.author_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' }); const body = textInput(req.body?.body, 4000); if (!body) return res.status(400).json({ error: 'Comment body is required' }); db.exec('BEGIN'); try { db.prepare('INSERT INTO comment_revisions VALUES (?, ?, ?, COALESCE((SELECT MAX(revision_number) FROM comment_revisions WHERE comment_id = ?), 0) + 1, ?)').run(id(), comment.id, comment.body, comment.id, now()); db.prepare('UPDATE comments SET body = ?, updated_at = ? WHERE id = ?').run(body, now(), comment.id); db.exec('COMMIT'); res.json({ updated: true }); } catch (error) { db.exec('ROLLBACK'); res.status(500).json({ error: 'Unable to update comment' }); } });
app.delete('/api/comments/:id', requireLogin, (req, res) => { if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Comment not found' }); const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id); if (!comment || comment.author_id !== req.session.user.id) return res.status(403).json({ error: 'Forbidden' }); db.exec('BEGIN'); try { db.prepare('DELETE FROM comment_revisions WHERE comment_id = ?').run(comment.id); db.prepare('DELETE FROM comments WHERE id = ?').run(comment.id); db.exec('COMMIT'); res.json({ deleted: true }); } catch (error) { db.exec('ROLLBACK'); res.status(500).json({ error: 'Unable to delete comment' }); } });
app.post('/api/posts/:id/like', requireLogin, (req, res) => { if (!isUuid(req.params.id) || !postWithStats(req.params.id)) return res.status(404).json({ error: 'Post not found' }); db.prepare('INSERT OR IGNORE INTO likes VALUES (?, ?)').run(req.session.user.id, req.params.id); res.json({ liked: true }); });
app.delete('/api/posts/:id/like', requireLogin, (req, res) => { if (!isUuid(req.params.id) || !postWithStats(req.params.id)) return res.status(404).json({ error: 'Post not found' }); db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.session.user.id, req.params.id); res.json({ liked: false }); });

// Intentional challenge bug: authentication is checked, ownership is not checked.
app.get('/api/comments/:id/history', requireLogin, (req, res) => { if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Comment not found' }); const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(req.params.id); if (!comment) return res.status(404).json({ error: 'Comment not found' }); const history = db.prepare('SELECT id, comment_id, body, revision_number, created_at FROM comment_revisions WHERE comment_id = ? ORDER BY revision_number').all(comment.id); res.json({ comment: { id: comment.id, post_id: comment.post_id }, history }); });

app.get('/', requireLogin, (req, res) => res.render('home', { posts: db.prepare(`SELECT posts.*, users.username, (SELECT COUNT(*) FROM comments WHERE post_id = posts.id) comment_count, (SELECT COUNT(*) FROM likes WHERE post_id = posts.id) like_count FROM posts JOIN users ON users.id = posts.author_id ORDER BY posts.created_at DESC`).all() }));
app.get('/register', (req, res) => res.render('register', { error: null }));
app.get('/login', (req, res) => res.render('login', { error: null, message: req.query.registered ? 'Account created. Please login to continue.' : null }));

app.get('/posts/:id', requireLogin, (req, res) => { const post = db.prepare(`SELECT posts.*, users.username, (SELECT COUNT(*) FROM likes WHERE post_id = posts.id) like_count FROM posts JOIN users ON users.id = posts.author_id WHERE posts.id = ?`).get(req.params.id); if (!post) return res.status(404).send('Not found'); const comments = db.prepare('SELECT comments.*, users.username FROM comments JOIN users ON users.id = comments.author_id WHERE post_id = ? ORDER BY comments.created_at').all(post.id); const liked = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.session.user.id, post.id); res.render('post', { post, comments, liked: !!liked }); });

// Intentional challenge bug: the endpoint requires login but omits comment ownership authorization.

app.use((error, req, res, next) => { console.error(error); if (res.headersSent) return next(error); res.status(500).json({ error: 'Internal server error' }); });

app.listen(port, () => console.log(`Blog CTF running at http://localhost:${port}`));
