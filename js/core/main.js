class ShaRecipeApp {
    constructor() {
        this.storageKeys = {
            users: 'shaRecipeUsers',
            recipes: 'shaRecipeRecipes',
            currentUser: 'shaRecipeCurrentUser',
            dataVersion: 'shaRecipeDataVersion'
        };
        this.pageRoutes = {
            'login.html': 'pages/auth/login.html',
            'signup.html': 'pages/auth/signup.html',
            'home.html': 'pages/recipes/home.html',
            'browse.html': 'pages/recipes/browse.html',
            'post-recipe.html': 'pages/recipes/post-recipe.html',
            'recipe-detail.html': 'pages/recipes/recipe-detail.html',
            'dashboard.html': 'pages/user/dashboard.html',
            'admin.html': 'pages/admin/index.html'
        };

        this.dataVersion = '2026-05-11-supabase-sync';
        this.supabase = window.supabaseClient || null;
        this.users = this.loadCollection(this.storageKeys.users);
        this.recipes = this.loadCollection(this.storageKeys.recipes);
        this.currentUser = this.loadObject(this.storageKeys.currentUser);

        localStorage.removeItem('shaRecipeTransactions');
        this.migrateDataIfNeeded();
        this.initEventListeners();
        this.initPersistenceGuards();
        this.ready = this.initialize().catch((error) => {
            console.error('ShaRecipe initialization failed.', error);
            return null;
        });
    }

    async initialize() {
        if (!this.supabase) {
            console.error('Supabase client is not available.');
            return;
        }

        await this.ensureRemoteAdmin();
        await this.refreshData();
    }

    loadCollection(key) {
        try {
            const data = JSON.parse(localStorage.getItem(key));
            return Array.isArray(data) ? data : [];
        } catch (error) {
            return [];
        }
    }

    loadObject(key) {
        try {
            return JSON.parse(localStorage.getItem(key));
        } catch (error) {
            return null;
        }
    }

    migrateDataIfNeeded() {
        if (localStorage.getItem(this.storageKeys.dataVersion) === this.dataVersion) {
            return;
        }

        this.users = this.users
            .filter((user) => user && user.id && user.username && user.email)
            .map((user) => ({
                createdAt: user.createdAt || new Date().toISOString(),
                notifications: Array.isArray(user.notifications) ? user.notifications : [],
                profilePhoto: typeof user.profilePhoto === 'string' ? user.profilePhoto : '',
                favoriteRecipeIds: Array.isArray(user.favoriteRecipeIds) ? user.favoriteRecipeIds.filter(Boolean) : [],
                displayName: typeof user.displayName === 'string' ? user.displayName : '',
                role: user.isAdmin || user.role === 'admin' ? 'admin' : 'user',
                isAdmin: user.isAdmin || user.role === 'admin',
                ...user
            }));

        this.recipes = this.recipes
            .filter((recipe) => recipe && recipe.id && recipe.userId)
            .map((recipe) => ({
                createdAt: recipe.createdAt || new Date().toISOString(),
                category: this.normalizeRecipeCategory(recipe.category),
                likes: Number(recipe.likes || 0),
                ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
                steps: Array.isArray(recipe.steps) ? recipe.steps : [],
                status: this.normalizeRecipeStatus(recipe.status || 'approved'),
                reviewRemarks: typeof recipe.reviewRemarks === 'string' ? recipe.reviewRemarks : '',
                reviewedAt: recipe.reviewedAt || '',
                reviewedBy: recipe.reviewedBy || '',
                ...recipe
            }));

        this.saveUsers();
        this.saveRecipes();
        this.saveCurrentUser();
        localStorage.setItem(this.storageKeys.dataVersion, this.dataVersion);
    }

    initEventListeners() {
        const loginBtn = document.getElementById('loginBtn');
        const signupBtn = document.getElementById('signupBtn');

        if (loginBtn) {
            loginBtn.addEventListener('click', () => this.goToPage('login.html'));
        }

        if (signupBtn) {
            signupBtn.addEventListener('click', () => this.goToPage('signup.html'));
        }
    }

    initPersistenceGuards() {
        const persist = () => this.persistState();
        window.addEventListener('beforeunload', persist);
        window.addEventListener('pagehide', persist);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                persist();
            }
        });
    }

    persistState() {
        this.saveUsers();
        this.saveRecipes();
        this.saveCurrentUser();
    }

    async refreshData() {
        const [usersResult, recipesResult] = await Promise.all([
            this.supabase
                .from('users')
                .select('*')
                .order('created_at', { ascending: true }),
            this.supabase
                .from('recipes')
                .select('*')
                .order('created_at', { ascending: false })
        ]);

        if (usersResult.error) {
            throw usersResult.error;
        }
        if (recipesResult.error) {
            throw recipesResult.error;
        }

        this.users = this.mergeRemoteUsers(usersResult.data || []);
        this.recipes = this.mergeRemoteRecipes(recipesResult.data || []);

        if (this.currentUser?.id) {
            this.currentUser = this.getUserById(this.currentUser.id) || null;
        }

        this.saveUsers();
        this.saveRecipes();
        this.saveCurrentUser();
    }

    mergeRemoteUsers(remoteUsers) {
        const localUsers = this.loadCollection(this.storageKeys.users);
        const localMap = new Map(localUsers.map((user) => [user.id, user]));

        return remoteUsers.map((user) => {
            const local = localMap.get(user.id) || {};
            const isAdmin = Boolean(user.is_admin) || user.role === 'admin';

            return {
                id: user.id,
                username: user.username || '',
                email: user.email || '',
                password: user.password || '',
                displayName: typeof local.displayName === 'string' && local.displayName
                    ? local.displayName
                    : (user.display_name || ''),
                profilePhoto: typeof local.profilePhoto === 'string' && local.profilePhoto
                    ? local.profilePhoto
                    : (user.profile_photo || ''),
                notifications: Array.isArray(local.notifications) ? local.notifications : [],
                favoriteRecipeIds: Array.isArray(local.favoriteRecipeIds) ? local.favoriteRecipeIds.filter(Boolean) : [],
                role: isAdmin ? 'admin' : 'user',
                isAdmin,
                createdAt: user.created_at || new Date().toISOString()
            };
        });
    }

    mergeRemoteRecipes(remoteRecipes) {
        return remoteRecipes
            .filter((recipe) => recipe && recipe.id && recipe.user_id)
            .map((recipe) => ({
                id: recipe.id,
                userId: recipe.user_id,
                title: recipe.title || '',
                description: recipe.description || '',
                category: this.normalizeRecipeCategory(recipe.category),
                image: recipe.image || '',
                ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
                steps: Array.isArray(recipe.steps) ? recipe.steps : [],
                status: this.normalizeRecipeStatus(recipe.status || 'pending'),
                reviewRemarks: recipe.review_remarks || '',
                reviewedAt: recipe.reviewed_at || '',
                reviewedBy: recipe.reviewed_by || '',
                likes: Number(recipe.likes || 0),
                creator: recipe.creator || '',
                createdAt: recipe.created_at || new Date().toISOString()
            }));
    }

    async ensureRemoteAdmin() {
        const now = new Date().toISOString();
        const { error } = await this.supabase
            .from('users')
            .upsert({
                id: 'admin',
                username: 'admin',
                email: 'admin@sharecipe.com',
                password: 'admin123',
                display_name: '',
                profile_photo: '',
                role: 'admin',
                is_admin: true,
                created_at: now
            }, {
                onConflict: 'id'
            });

        if (error) {
            console.error('Unable to seed admin account.', error);
        }
    }

    isPagesContext() {
        return window.location.pathname.includes('/pages/');
    }

    buildProjectUrl(relativePath) {
        const currentUrl = new URL(window.location.href);
        const currentPath = currentUrl.pathname;
        const pagesIndex = currentPath.indexOf('/pages/');
        const rootPath = pagesIndex >= 0
            ? currentPath.slice(0, pagesIndex)
            : currentPath.slice(0, currentPath.lastIndexOf('/'));
        currentUrl.pathname = `${rootPath}/${relativePath}`.replace(/\/{2,}/g, '/');
        currentUrl.search = '';
        currentUrl.hash = '';
        return currentUrl.toString();
    }

    pagePath(pageName) {
        return this.buildProjectUrl(this.pageRoutes[pageName] || pageName);
    }

    goToPage(pageName) {
        window.location.href = this.pagePath(pageName);
    }

    goToLanding() {
        window.location.href = this.buildProjectUrl('index.html');
    }

    goToUserHome() {
        this.goToPage('home.html');
    }

    goToAdminHome() {
        this.goToPage('admin.html');
    }

    goToDashboard() {
        this.goToPage('dashboard.html');
    }

    getUserById(userId) {
        return this.users.find((user) => user.id === userId) || null;
    }

    normalizeRecipeCategory(category) {
        const value = String(category || '').trim();
        return value || 'Meal';
    }

    normalizeRecipeStatus(status) {
        const value = String(status || '').trim().toLowerCase();
        if (value === 'approved' || value === 'rejected') {
            return value;
        }
        return 'pending';
    }

    getRecipeCategories() {
        return ['Meal', 'Dessert', 'Snack', 'Drink', 'Breakfast', 'Appetizer'];
    }

    recipeMatchesSearch(recipe, searchTerm) {
        const query = String(searchTerm || '').trim().toLowerCase();
        if (!query) {
            return true;
        }

        const haystacks = [
            recipe?.title,
            recipe?.description,
            recipe?.creator,
            this.getCreatorName(recipe),
            this.normalizeRecipeCategory(recipe?.category),
            Array.isArray(recipe?.ingredients) ? recipe.ingredients.join(' ') : '',
            Array.isArray(recipe?.steps) ? recipe.steps.join(' ') : ''
        ];

        return haystacks.some((value) => String(value || '').toLowerCase().includes(query));
    }

    getNotificationsForUser(userId) {
        const user = this.getUserById(userId);
        if (!user || !Array.isArray(user.notifications)) {
            return [];
        }

        return user.notifications
            .slice()
            .sort((left, right) => new Date(right.createdAt || 0) - new Date(left.createdAt || 0));
    }

    getUnreadNotificationCount(userId) {
        return this.getNotificationsForUser(userId).filter((notification) => !notification.read).length;
    }

    addNotification(userId, notificationData) {
        const targetUser = this.getUserById(userId);
        if (!targetUser) {
            return null;
        }

        const notification = {
            id: `notification-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            type: String(notificationData?.type || 'general'),
            title: String(notificationData?.title || 'Recipe update'),
            message: String(notificationData?.message || ''),
            recipeId: String(notificationData?.recipeId || ''),
            status: this.normalizeRecipeStatus(notificationData?.status || 'pending'),
            read: false,
            createdAt: new Date().toISOString()
        };

        this.users = this.users.map((user) => user.id === userId
            ? { ...user, notifications: [notification].concat(Array.isArray(user.notifications) ? user.notifications : []) }
            : user);
        this.saveUsers();

        if (this.currentUser?.id === userId) {
            this.currentUser = this.getUserById(userId);
            this.saveCurrentUser();
        }

        return notification;
    }

    markNotificationsRead(userId) {
        const user = this.getUserById(userId);
        if (!user || !Array.isArray(user.notifications) || user.notifications.every((notification) => notification.read)) {
            return;
        }

        this.users = this.users.map((entry) => entry.id === userId
            ? {
                ...entry,
                notifications: entry.notifications.map((notification) => ({
                    ...notification,
                    read: true
                }))
            }
            : entry);
        this.saveUsers();

        if (this.currentUser?.id === userId) {
            this.currentUser = this.getUserById(userId);
            this.saveCurrentUser();
        }
    }

    getCurrentUser() {
        if (!this.currentUser) {
            return null;
        }

        const freshUser = this.getUserById(this.currentUser.id) || null;
        if (freshUser) {
            this.currentUser = freshUser;
            this.saveCurrentUser();
            return freshUser;
        }

        this.clearSession();
        return null;
    }

    requireAuth() {
        const user = this.getCurrentUser();
        if (!user) {
            this.goToLanding();
            return null;
        }
        return user;
    }

    requireUser() {
        const user = this.requireAuth();
        if (!user) {
            return null;
        }

        if (user.role === 'admin') {
            this.goToAdminHome();
            return null;
        }

        return user;
    }

    requireAdmin() {
        const user = this.requireAuth();
        if (!user) {
            return null;
        }

        if (user.role !== 'admin') {
            this.goToUserHome();
            return null;
        }

        return user;
    }

    saveUsers() {
        localStorage.setItem(this.storageKeys.users, JSON.stringify(this.users));
    }

    saveRecipes() {
        localStorage.setItem(this.storageKeys.recipes, JSON.stringify(this.recipes));
    }

    saveCurrentUser() {
        if (this.currentUser) {
            localStorage.setItem(this.storageKeys.currentUser, JSON.stringify(this.currentUser));
            return;
        }

        localStorage.removeItem(this.storageKeys.currentUser);
    }

    clearSession() {
        this.currentUser = null;
        localStorage.removeItem(this.storageKeys.currentUser);
    }

    login(username, password) {
        const loginValue = String(username || '').trim().toLowerCase();
        const secret = String(password || '');
        const user = this.users.find((entry) => {
            const usernameMatch = String(entry.username || '').toLowerCase() === loginValue;
            const emailMatch = String(entry.email || '').toLowerCase() === loginValue;
            return (usernameMatch || emailMatch) && entry.password === secret;
        });
        if (!user) {
            return false;
        }

        this.currentUser = user;
        this.saveCurrentUser();

        if (user.role === 'admin') {
            this.goToAdminHome();
        } else {
            this.goToUserHome();
        }

        return true;
    }

    logout() {
        this.clearSession();
        this.goToLanding();
    }

    async createUser(userData) {
        const username = String(userData?.username || '').trim();
        const email = String(userData?.email || '').trim();
        const password = String(userData?.password || '');

        if (username.length < 3 || password.length < 6 || !email) {
            return { ok: false, error: 'Please provide valid account details.' };
        }

        if (this.users.some((user) => user.username?.toLowerCase() === username.toLowerCase())) {
            return { ok: false, error: 'Username already exists.' };
        }

        if (this.users.some((user) => user.email?.toLowerCase() === email.toLowerCase())) {
            return { ok: false, error: 'Email already exists.' };
        }

        const newUser = {
            id: `user-${Date.now()}`,
            username,
            email,
            password,
            display_name: '',
            profile_photo: '',
            role: 'user',
            is_admin: false,
            created_at: new Date().toISOString()
        };

        const { error } = await this.supabase
            .from('users')
            .insert(newUser);

        if (error) {
            return { ok: false, error: error.message || 'Unable to create account.' };
        }

        await this.refreshData();
        return { ok: true, user: this.getUserById(newUser.id) };
    }

    updateCurrentUserProfile(updates) {
        const activeUser = this.requireAuth();
        if (!activeUser) {
            return null;
        }

        this.currentUser = { ...activeUser, ...updates };
        this.users = this.users.map((user) => user.id === this.currentUser.id ? { ...user, ...updates } : user);
        this.saveUsers();
        this.saveCurrentUser();
        return this.currentUser;
    }

    async addRecipe(recipeData) {
        const activeUser = this.requireUser();
        if (!activeUser) {
            return null;
        }

        const payload = {
            id: `recipe-${Date.now()}`,
            user_id: activeUser.id,
            title: recipeData.title,
            description: recipeData.description,
            category: this.normalizeRecipeCategory(recipeData.category),
            image: recipeData.image || '',
            ingredients: Array.isArray(recipeData.ingredients) ? recipeData.ingredients : [],
            steps: Array.isArray(recipeData.steps) ? recipeData.steps : [],
            status: 'pending',
            review_remarks: '',
            reviewed_at: null,
            reviewed_by: '',
            likes: Number(recipeData.likes || 0),
            created_at: new Date().toISOString()
        };

        const { error } = await this.supabase
            .from('recipes')
            .insert(payload);

        if (error) {
            console.error('Unable to insert recipe.', error);
            return null;
        }

        try {
            await this.refreshData();
        } catch (refreshError) {
            console.error('Recipe saved, but recipe refresh failed.', refreshError);
        }
        this.showToast('Recipe submitted for admin review.');
        return this.recipes.find((recipe) => recipe.id === payload.id) || {
            id: payload.id,
            userId: payload.user_id,
            title: payload.title,
            description: payload.description,
            category: payload.category,
            image: payload.image,
            ingredients: payload.ingredients,
            steps: payload.steps,
            status: payload.status,
            reviewRemarks: payload.review_remarks,
            reviewedAt: payload.reviewed_at || '',
            reviewedBy: payload.reviewed_by || '',
            likes: payload.likes,
            creator: recipeData.creator || this.getDisplayName(activeUser),
            createdAt: payload.created_at
        };
    }

    async updateRecipe(recipeId, recipeData) {
        const activeUser = this.requireUser();
        if (!activeUser || !recipeId) {
            return null;
        }

        const existingRecipe = this.recipes.find((entry) => entry.id === recipeId);
        if (!existingRecipe) {
            return null;
        }

        if (existingRecipe.userId !== activeUser.id && activeUser.role !== 'admin') {
            return null;
        }

        const payload = {
            title: recipeData.title,
            description: recipeData.description,
            category: this.normalizeRecipeCategory(recipeData.category),
            image: recipeData.image || '',
            ingredients: Array.isArray(recipeData.ingredients) ? recipeData.ingredients : [],
            steps: Array.isArray(recipeData.steps) ? recipeData.steps : [],
            status: activeUser.role === 'admin'
                ? this.normalizeRecipeStatus(recipeData.status || existingRecipe.status)
                : 'pending',
            review_remarks: activeUser.role === 'admin'
                ? String(recipeData.reviewRemarks || existingRecipe.reviewRemarks || '')
                : '',
            reviewed_at: activeUser.role === 'admin'
                ? (existingRecipe.reviewedAt || new Date().toISOString())
                : null,
            reviewed_by: activeUser.role === 'admin'
                ? (existingRecipe.reviewedBy || activeUser.username)
                : ''
        };

        const { error } = await this.supabase
            .from('recipes')
            .update(payload)
            .eq('id', recipeId);

        if (error) {
            console.error('Unable to update recipe.', error);
            return null;
        }

        try {
            await this.refreshData();
        } catch (refreshError) {
            console.error('Recipe updated, but recipe refresh failed.', refreshError);
        }
        this.showToast(activeUser.role === 'admin' ? 'Recipe updated successfully.' : 'Recipe updated and sent back for admin review.');
        return this.recipes.find((entry) => entry.id === recipeId) || {
            ...existingRecipe,
            ...recipeData,
            id: existingRecipe.id,
            userId: existingRecipe.userId,
            category: this.normalizeRecipeCategory(recipeData.category),
            status: activeUser.role === 'admin'
                ? this.normalizeRecipeStatus(recipeData.status || existingRecipe.status)
                : 'pending',
            reviewRemarks: activeUser.role === 'admin'
                ? String(recipeData.reviewRemarks || existingRecipe.reviewRemarks || '')
                : '',
            reviewedAt: activeUser.role === 'admin'
                ? (existingRecipe.reviewedAt || new Date().toISOString())
                : '',
            reviewedBy: activeUser.role === 'admin'
                ? (existingRecipe.reviewedBy || activeUser.username)
                : '',
            likes: Number(existingRecipe.likes || 0)
        };
    }

    async reviewRecipe(recipeId, reviewData) {
        const activeUser = this.requireAdmin();
        if (!activeUser || !recipeId) {
            return null;
        }

        const existingRecipe = this.recipes.find((entry) => entry.id === recipeId);
        if (!existingRecipe) {
            return null;
        }

        const nextStatus = this.normalizeRecipeStatus(reviewData?.status);
        const reviewRemarks = String(reviewData?.reviewRemarks || '').trim();
        if (!reviewRemarks) {
            return { ok: false, error: 'Please add remarks before approving or rejecting.' };
        }

        const { error } = await this.supabase
            .from('recipes')
            .update({
                status: nextStatus,
                review_remarks: reviewRemarks,
                reviewed_at: new Date().toISOString(),
                reviewed_by: activeUser.username
            })
            .eq('id', recipeId);

        if (error) {
            return { ok: false, error: error.message || 'Unable to save this review right now.' };
        }

        await this.refreshData();
        this.addNotification(existingRecipe.userId, {
            type: 'review',
            title: nextStatus === 'approved' ? 'Post passed' : 'Post rejected',
            message: nextStatus === 'approved'
                ? `"${existingRecipe.title || 'Your recipe'}" passed admin review. ${reviewRemarks}`
                : `"${existingRecipe.title || 'Your recipe'}" was rejected. ${reviewRemarks}`,
            recipeId: existingRecipe.id,
            status: nextStatus
        });
        this.showToast(nextStatus === 'approved' ? 'Recipe approved.' : 'Recipe rejected with feedback.');
        return { ok: true, recipe: this.recipes.find((entry) => entry.id === recipeId) || existingRecipe };
    }

    isRecipeVisibleToUser(recipe, user) {
        if (!recipe || !user) {
            return false;
        }

        if (user.role === 'admin') {
            return true;
        }

        if (recipe.userId === user.id) {
            return true;
        }

        return this.normalizeRecipeStatus(recipe.status) === 'approved';
    }

    getVisibleRecipesForUser(user) {
        if (!user) {
            return [];
        }

        return this.recipes.filter((recipe) => this.isRecipeVisibleToUser(recipe, user));
    }

    getApprovedRecipes() {
        return this.recipes.filter((recipe) => this.normalizeRecipeStatus(recipe.status) === 'approved');
    }

    getRecipeStatusLabel(status) {
        const normalized = this.normalizeRecipeStatus(status);
        if (normalized === 'approved') {
            return 'Approved';
        }
        if (normalized === 'rejected') {
            return 'Rejected';
        }
        return 'Pending';
    }

    async deleteRecipe(recipeId) {
        const recipe = this.recipes.find((entry) => entry.id === recipeId);
        if (!recipe) {
            return false;
        }

        const activeUser = this.requireAuth();
        if (!activeUser) {
            return false;
        }

        if (activeUser.role !== 'admin' && recipe.userId !== activeUser.id) {
            return false;
        }

        const { error } = await this.supabase
            .from('recipes')
            .delete()
            .eq('id', recipeId);

        if (error) {
            return false;
        }

        await this.refreshData();
        this.showToast('Recipe deleted.');
        return true;
    }

    async deleteUser(userId) {
        if (userId === 'admin') {
            return false;
        }

        const { error } = await this.supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) {
            return false;
        }

        this.users = this.users.filter((user) => user.id !== userId);
        this.recipes = this.recipes.filter((recipe) => recipe.userId !== userId);
        this.saveUsers();
        this.saveRecipes();

        if (this.currentUser?.id === userId) {
            this.logout();
            return true;
        }

        await this.refreshData();
        return true;
    }

    getCreatorName(recipe) {
        const user = this.getUserById(recipe.userId);
        return recipe.creator || this.getDisplayName(user) || 'Unknown';
    }

    getDisplayName(user) {
        if (!user) {
            return '';
        }

        if (typeof user.displayName === 'string' && user.displayName.trim()) {
            return user.displayName.trim();
        }

        if (typeof user.username === 'string' && user.username.trim()) {
            return user.username.trim();
        }

        if (typeof user.email === 'string' && user.email.trim()) {
            return user.email.trim().split('@')[0];
        }

        return 'Member';
    }

    getUserInitials(user) {
        return this.getDisplayName(user)
            .split(/\s+/)
            .map((part) => part[0])
            .join('')
            .slice(0, 2)
            .toUpperCase() || 'SR';
    }

    isImageUrl(value) {
        return typeof value === 'string' && /^(data:image\/|https?:\/\/|blob:)/.test(value);
    }

    isRecipeFavorited(recipeId) {
        const activeUser = this.getCurrentUser();
        if (!activeUser || !recipeId) {
            return false;
        }

        return Array.isArray(activeUser.favoriteRecipeIds) && activeUser.favoriteRecipeIds.includes(recipeId);
    }

    async toggleFavoriteRecipe(recipeId) {
        const activeUser = this.requireUser();
        if (!activeUser || !recipeId) {
            return null;
        }

        const recipe = this.recipes.find((entry) => entry.id === recipeId);
        if (!recipe || recipe.userId === activeUser.id || this.normalizeRecipeStatus(recipe.status) !== 'approved') {
            return null;
        }

        const currentFavorites = Array.isArray(activeUser.favoriteRecipeIds) ? activeUser.favoriteRecipeIds : [];
        const isFavorited = currentFavorites.includes(recipeId);
        const favoriteRecipeIds = isFavorited
            ? currentFavorites.filter((id) => id !== recipeId)
            : [...currentFavorites, recipeId];

        const nextLikes = Math.max(0, Number(recipe.likes || 0) + (isFavorited ? -1 : 1));
        this.updateCurrentUserProfile({ favoriteRecipeIds });

        const { error } = await this.supabase
            .from('recipes')
            .update({ likes: nextLikes })
            .eq('id', recipeId);

        if (error) {
            return null;
        }

        await this.refreshData();
        this.updateCurrentUserProfile({ favoriteRecipeIds });

        return {
            isFavorited: favoriteRecipeIds.includes(recipeId),
            likes: nextLikes,
            user: this.getCurrentUser()
        };
    }

    showToast(message) {
        if (!document.body) {
            return;
        }

        const toast = document.createElement('div');
        toast.className = 'app-toast';
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, var(--brand), var(--brand-deep));
            color: white;
            padding: 1rem 1.4rem;
            border-radius: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            transform: translateY(-12px);
            opacity: 0;
            transition: opacity 0.2s ease, transform 0.2s ease;
        `;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        window.setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-12px)';
            window.setTimeout(() => toast.remove(), 200);
        }, 2600);
    }
}

const app = new ShaRecipeApp();
window.ShaRecipeApp = app;
