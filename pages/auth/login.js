document.addEventListener('DOMContentLoaded', async function() {
    await window.ShaRecipeApp?.ready;

    const loginForm = document.getElementById('loginForm');
    const errorDiv = document.getElementById('loginError');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePassword = document.querySelector('.toggle-password');
    const submitBtn = loginForm?.querySelector('button[type="submit"]');
    const defaultSubmitLabel = submitBtn?.textContent || 'Log In';
    let isSubmitting = false;

    if (!loginForm || !errorDiv || !usernameInput || !passwordInput) {
        return;
    }

    const eyeIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    const eyeOffIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';

    loginForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        if (isSubmitting) {
            return;
        }

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        setSubmittingState(true);
        await window.ShaRecipeApp?.refreshDataSafe();

        if (window.ShaRecipeApp?.login(username, password)) {
            clearError();
            return;
        }

        errorDiv.textContent = 'Invalid username or password.';
        errorDiv.style.display = 'block';
        setSubmittingState(false);
    });

    usernameInput.addEventListener('input', clearError);
    passwordInput.addEventListener('input', clearError);

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

    function clearError() {
        errorDiv.textContent = '';
        errorDiv.style.display = 'none';
    }

    function setSubmittingState(nextState) {
        isSubmitting = nextState;
        if (submitBtn) {
            submitBtn.disabled = nextState;
            submitBtn.textContent = nextState ? 'Checking...' : defaultSubmitLabel;
        }
        usernameInput.disabled = nextState;
        passwordInput.disabled = nextState;
    }
});
