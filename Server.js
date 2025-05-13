const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const app = express();

// Подключение к БД PostgreSQL
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'Server',
    password: '0000',
    port: 5432,
});
pool.connect()
    .then(() => console.log('БД подключена'))
    .catch(err => console.error('Ошибка подключения к БД', err));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Настройки EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Сессии
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000
    },
    name: 'sessionId'
}));

// Middleware аутентификации
const requireAuth = (req, res, next) => {
    if (!req.session.user) return res.redirect('/');
    next();
};

// Маршруты
app.get('/', (req, res) => {
    if (req.session.user) return res.redirect('/home');
    res.render('reg', { error: null });
});

app.get('/home', (req, res) => {
    if (req.session.user?.role === 'leader') {
        res.render('index', { user: req.session.user });
    } else {
        res.redirect('/member-home');
    }
});
app.get('/member-home', (req, res) => {
    if (req.session.user?.role === 'member') {
        res.render('mem_index', { user: req.session.user });
    } else {
        res.redirect('/home');
    }
});

// Роут регистрации (обработка POST из клиентского JS)
app.post('/register', async (req, res) => {
    const { name, lastname, email, password, role } = req.body;
    try {
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (name, lastname, email, password, role) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [name, lastname, email, hash, role]
        );
        req.session.user = {
            email: result.rows[0].email,
            name: result.rows[0].name,
            lastname: result.rows[0].lastname,
            role: result.rows[0].role
        };
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка регистрации:', err);
        res.json({ success: false, message: 'Пользователь уже существует или ошибка сервера.' });
    }
});

// Вход
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.json({ success: false, message: 'Неверный email или пароль' });
        }
        const user = result.rows[0];
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.json({ success: false, message: 'Неверный email или пароль' });
        }
        req.session.user = {
            email: user.email,
            name: user.name,
            lastname: user.lastname,
            role: user.role
        };
        req.session.save(err => {
            if (err) return res.json({ success: false, message: 'Ошибка сервера' });
            return res.json({
                success: true,
                redirectTo: user.role === 'leader' ? '/home' : '/memhome'
            });
        });
    } catch (err) {
        console.error('Ошибка входа:', err);
        res.json({ success: false, message: 'Ошибка входа' });
    }
});

// Получение задач

// Получение задач
app.get('/tasks', requireAuth, async (req, res) => {
    try {
        // Проверяем роль пользователя
        if (req.session.user.role === 'member') {
            return res.redirect('/mem_tasks');
        }

        // Для лидера показываем обычную страницу задач
        const result = await pool.query('SELECT * FROM tasks WHERE user_email = $1', [req.session.user.email]);
        res.render('tasks', { tasks: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки задач:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Специальный маршрут для участников с ролью member
app.get('/mem_tasks', requireAuth, async (req, res) => {
    try {
        // Проверяем, что пользователь действительно member
        if (req.session.user.role !== 'member') {
            return res.redirect('/tasks');
        }

        // Логика для отображения задач участника
        const result = await pool.query('SELECT * FROM tasks WHERE user_email = $1', [req.session.user.email]);
        res.render('mem_tasks', { tasks: result.rows });
    } catch (err) {
        console.error('Ошибка загрузки задач участника:', err);
        res.status(500).send('Ошибка сервера');
    }
});

// Добавление задачи
app.post('/tasks', requireAuth, async (req, res) => {
    const {
        name, description, start_date, end_date, planned_days = 0,
        tags, status = 'new', type, priority, executors, commentators,
        files, completed = false, time_spent = 0, completion_date
    } = req.body;

    if (!name || !description) {
        return res.status(400).send('Необходимо заполнить все поля');
    }

    try {
        const result = await pool.query(`
            INSERT INTO tasks (
                name, description, start_date, end_date, planned_days, tags, status,
                type, priority, executors, commentators, files, completed, time_spent,
                completion_date, user_email
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7,
                $8, $9, $10, $11, $12, $13, $14,
                $15, $16
            ) RETURNING id`,
            [
                name, description, start_date || null, end_date || null, planned_days,
                tags || null, status, type || null, priority || null, executors || null,
                commentators || null, files || null, completed, time_spent,
                completion_date || null, req.session.user.email
            ]
        );

        // Перенаправляем в зависимости от роли
        const redirectPath = req.session.user.role === 'member' ? '/mem_tasks' : '/tasks';
        res.redirect(redirectPath);
    } catch (err) {
        console.error('Ошибка при добавлении задачи:', err);
        res.status(500).send('Ошибка при добавлении задачи');
    }
});

// Выход
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.redirect('/home');
        res.clearCookie('sessionId');
        res.redirect('/');
    });
});

// 404 и 500
app.use((req, res) => res.status(404).render('404'));
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).render('500');
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});
