document.addEventListener('DOMContentLoaded', async function() {
    await window.ShaRecipeApp?.ready;

    const signupForm = document.getElementById('signupForm');
    const errorDiv = document.getElementById('signupError');
    const successDiv = document.getElementById('signupSuccess');
    const usernameInput = document.getElementById('signupUsername');
    const emailInput = document.getElementById('signupEmail');
    const passwordInput = document.getElementById('signupPassword');
    const togglePassword = document.querySelector('.toggle-password');

    if (!signupForm || !errorDiv || !successDiv || !usernameInput || !emailInput || !passwordInput) {
        return;
    }

    const eyeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const eyeOffIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    signupForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (username.length < 3) {
            showError('Username must be at least 3 characters.');
            return;
        }

        if (!email) {
            showError('Email is required.');
            return;
        }

        const result = await window.ShaRecipeApp?.createUser({ username, email, password });
        if (!result) {
            showError('The app is not ready yet. Please refresh and try again.');
            return;
        }

        if (!result.ok) {
            showError(result.error);
            return;
        }

        showSuccess('Account created. Redirecting to login...');
        window.setTimeout(function() {
            window.location.href = 'login.html';
        }, 1500);
    });

    usernameInput.addEventListener('input', clearMessages);
    emailInput.addEventListener('input', clearMessages);
    passwordInput.addEventListener('input', clearMessages);

    togglePassword?.addEventListener('click', function() {
        const type = passwordInput.type === 'password' ? 'text' : 'password';
        passwordInput.type = type;

        if (type === 'password') {
            this.innerHTML = eyeIcon;
            this.setAttribute('aria-label', 'Show password');
        } else {
            this.innerHTML = eyeOffIcon;
            this.setAttribute('aria-label', 'Hide password');
        }
    });

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        successDiv.textContent = '';
        successDiv.style.display = 'none';
    }

    function showSuccess(message) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
    }

    function clearMessages() {
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
        successDiv.textContent = '';
        successDiv.style.display = 'none';
    }
});
