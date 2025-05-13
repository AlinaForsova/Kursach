document.addEventListener('DOMContentLoaded', () => {
    const registerForm = document.querySelector('#register-form');

    if (!registerForm) return;

    registerForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const name = registerForm.querySelector('#register-name').value.trim();
        const lastname = registerForm.querySelector('#register-lastname').value.trim();
        const email = registerForm.querySelector('#register-email').value.trim();
        const role = registerForm.querySelector('#register-role').value;
        const password = registerForm.querySelector('#register-password').value;
        const confirmPassword = registerForm.querySelector('#register-confirm-password').value;
        const terms = registerForm.querySelector('#terms').checked;

        // Валидация
        if (!name || !lastname || !email || !password || !confirmPassword || !terms) {
            return alert('Пожалуйста, заполните все поля и согласитесь с условиями.');
        }

        if (!validateEmail(email)) {
            return alert('Введите корректный email.');
        }

        if (password.length < 6) {
            return alert('Пароль должен быть не менее 6 символов.');
        }

        if (password !== confirmPassword) {
            return alert('Пароли не совпадают.');
        }

        // Отправка данных на сервер
        fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, lastname, email, password, role })
        })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    alert('Регистрация прошла успешно!');
                    if (data.role === 'leader') {
                        window.location.href = '/home'; // index.ejs
                    } else if (data.role === 'member') {
                        window.location.href = '/member-home'; // mem_index.ejs
                    } else {
                        window.location.href = '/'; // fallback
                    }
                } else {
                    alert(data.message || 'Ошибка регистрации. Попробуйте снова.');
                }
            })
            .catch(err => {
                console.error('Ошибка запроса:', err);
                alert('Ошибка подключения. Попробуйте позже.');
            });
    });

    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
});
