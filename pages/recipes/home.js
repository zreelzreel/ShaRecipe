document.addEventListener('DOMContentLoaded', async function() {
    const app = window.ShaRecipeApp;
    await app.ready;

    let user = app.requireUser();
    if (!user) {
        return;
    }

    const searchForm = document.querySelector('.market-search');
    const searchInput = document.getElementById('searchInput');
    const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
    const recipeGrid = document.getElementById('recipeGrid');
    const emptyState = document.getElementById('emptyState');
    const resultsSummary = document.getElementById('resultsSummary');
    const logoutBtn = document.getElementById('logoutBtn');
    const postBtn = document.getElementById('postBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const categoryFilter = document.getElementById('categoryFilter');
    const notificationBtn = document.getElementById('notificationBtn');
    const notificationCount = document.getElementById('notificationCount');
    const notificationPanel = document.getElementById('notificationPanel');
    const notificationList = document.getElementById('notificationList');
    const notificationSummary = document.getElementById('notificationSummary');

    const palette = [
        'linear-gradient(135deg, #26433b, #4b7868 48%, #d5663d 88%)',
        'linear-gradient(135deg, #3f584c, #7e9b63 52%, #f0bd53 96%)',
        'linear-gradient(135deg, #35564d, #d5663d 60%, #f0bd53 100%)',
        'linear-gradient(135deg, #2f4941, #5f7a45 48%, #d98a43 90%)'
    ];

    let activeFilter = 'all';
    const initialSearchState = readSearchFromUrl();

    hydrateCategoryFilter();
    applySearchState(initialSearchState);
    rerenderAll();

    const unsubscribeData = app.subscribeToData(function() {
        const refreshedUser = app.getCurrentUser();
        if (!refreshedUser) {
            app.goToLanding();
            return;
        }

        user = refreshedUser;
        rerenderAll();
    });

    window.addEventListener('storage', function(event) {
        if (event.key && event.key !== app.storageKeys.users && event.key !== app.storageKeys.recipes && event.key !== app.storageKeys.currentUser) {
            return;
        }

        const refreshedUser = app.getCurrentUser();
        if (!refreshedUser) {
            app.goToLanding();
            return;
        }

        user = refreshedUser;
        rerenderAll();
    });

    window.addEventListener('pagehide', unsubscribeData);

    logoutBtn?.addEventListener('click', function() {
        app.logout();
    });

    postBtn?.addEventListener('click', function() {
        window.location.href = 'post-recipe.html';
    });

    dashboardBtn?.addEventListener('click', function() {
        app.goToDashboard();
    });

    notificationBtn?.addEventListener('click', function() {
        if (!notificationPanel) {
            return;
        }

        const willOpen = notificationPanel.hidden;
        notificationPanel.hidden = !willOpen;
        notificationBtn.setAttribute('aria-expanded', String(willOpen));

        if (willOpen) {
            app.markNotificationsRead(user.id);
            renderNotifications();
        }
    });

    document.addEventListener('click', function(event) {
        if (!notificationPanel || !notificationBtn || notificationPanel.hidden) {
            return;
        }

        if (notificationPanel.contains(event.target) || notificationBtn.contains(event.target)) {
            return;
        }

        notificationPanel.hidden = true;
        notificationBtn.setAttribute('aria-expanded', 'false');
    });

    searchInput?.addEventListener('input', debounce(renderRecipes, 180));
    categoryFilter?.addEventListener('change', renderRecipes);

    searchForm?.addEventListener('submit', function(event) {
        event.preventDefault();
        renderRecipes();
    });

    filterButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            activeFilter = button.dataset.filter || 'all';
            filterButtons.forEach(function(item) {
                item.classList.toggle('active', item === button);
            });
            renderRecipes();
        });
    });

    function rerenderAll() {
        hydrateUser();
        renderStats();
        renderNotifications();
        renderRecipes();
    }

    function hydrateUser() {
        const displayName = app.getDisplayName(user);
        const initials = app.getUserInitials(user);
        setText('userName', displayName);
        renderProfileAvatar(user.profilePhoto, initials);
        setText('heroTitle', `Welcome back, ${displayName}. Share recipes and keep your cooking ideas organized.`);
    }

    function hydrateCategoryFilter() {
        if (!categoryFilter) {
            return;
        }

        categoryFilter.innerHTML = ['<option value="all">All categories</option>']
            .concat(app.getRecipeCategories().map(function(category) {
                return `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`;
            }))
            .join('');
    }

    function renderStats() {
        const myRecipes = app.recipes.filter(function(recipe) {
            return recipe.userId === user.id && app.normalizeRecipeStatus(recipe.status) !== 'rejected';
        });

        setText('totalRecipesCount', app.getApprovedRecipes().length);
        setText('myRecipesCount', myRecipes.length);
    }

    function renderNotifications() {
        const notifications = app.getNotificationsForUser(user.id);
        const unreadCount = app.getUnreadNotificationCount(user.id);

        if (notificationCount) {
            notificationCount.hidden = unreadCount === 0;
            notificationCount.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
        }

        if (notificationSummary) {
            notificationSummary.textContent = `${unreadCount} unread`;
        }

        if (!notificationList) {
            return;
        }

        if (notifications.length === 0) {
            notificationList.innerHTML = '<p class="notification-empty">No recipe notifications yet.</p>';
            return;
        }

        notificationList.innerHTML = notifications.map(function(notification) {
            const status = app.normalizeRecipeStatus(notification.status);
            return `
                <article class="notification-card status-${status}${notification.read ? '' : ' is-unread'}">
                    <div class="notification-meta">
                        <span class="notification-label status-${status}">${escapeHtml(app.getRecipeStatusLabel(status))}</span>
                        <small>${formatDate(notification.createdAt)}</small>
                    </div>
                    <h4>${escapeHtml(notification.title || 'Recipe update')}</h4>
                    <p>${escapeHtml(notification.message || '')}</p>
                </article>
            `;
        }).join('');
    }

    function renderRecipes() {
        if (!recipeGrid) {
            return;
        }

        const query = (searchInput?.value || '').trim().toLowerCase();
        const activeCategory = categoryFilter?.value || 'all';
        const filtered = app.getVisibleRecipesForUser(user).filter(function(recipe) {
            const status = app.normalizeRecipeStatus(recipe.status);
            const category = app.normalizeRecipeCategory(recipe.category);
            const matchesSearch = app.recipeMatchesSearch(recipe, query);
            const matchesFilter = activeFilter === 'mine'
                ? recipe.userId === user.id && status !== 'rejected'
                : status === 'approved';
            const matchesCategory = activeCategory === 'all' || category === activeCategory;
            return matchesSearch && matchesFilter && matchesCategory;
        }).sort(function(left, right) {
            return new Date(right.createdAt) - new Date(left.createdAt);
        });

        syncSearchToUrl(query, activeCategory, activeFilter);

        if (resultsSummary) {
            resultsSummary.textContent = `${filtered.length} recipe${filtered.length === 1 ? '' : 's'}`;
        }

        if (emptyState) {
            emptyState.hidden = filtered.length > 0;
        }

        recipeGrid.innerHTML = filtered.map(function(recipe, index) {
            const tag = recipe.userId === user.id ? 'Mine' : 'Shared';
            const category = escapeHtml(app.normalizeRecipeCategory(recipe.category));
            return `
                <article class="listing-card">
                    <div class="listing-media" style="--card-accent:${palette[index % palette.length]}">
                        ${renderListingMedia(recipe)}
                        <span class="listing-tag">${tag}</span>
                    </div>
                    <div class="listing-body">
                        <div class="listing-meta">
                            <span class="price-pill">${category}</span>
                            <span class="creator-name">${escapeHtml(app.getCreatorName(recipe) || 'ShaRecipe cook')}</span>
                        </div>
                        <h3>${escapeHtml(recipe.title)}</h3>
                        <p>${escapeHtml(trimText(recipe.description, 110))}</p>
                        <div class="listing-footer">
                            <small>${formatDate(recipe.createdAt)}</small>
                            <button class="btn btn-primary" type="button" data-detail-id="${escapeHtml(recipe.id)}">View recipe</button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        recipeGrid.querySelectorAll('[data-detail-id]').forEach(function(button) {
            button.addEventListener('click', function() {
                window.location.href = `recipe-detail.html?id=${encodeURIComponent(button.dataset.detailId)}`;
            });
        });
    }

    function renderListingMedia(recipe) {
        if (app.isImageUrl(recipe.image)) {
            return `<img class="listing-photo" src="${recipe.image}" alt="${escapeHtml(recipe.title)}">`;
        }

        return '<span class="listing-image" aria-hidden="true"></span>';
    }

    function readSearchFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return {
            query: params.get('q') || '',
            category: params.get('category') || 'all',
            filter: params.get('filter') || 'all'
        };
    }

    function applySearchState(state) {
        if (searchInput) {
            searchInput.value = state.query;
        }

        activeFilter = state.filter === 'mine' ? 'mine' : 'all';

        if (categoryFilter) {
            categoryFilter.value = state.category;
            if (categoryFilter.value !== state.category) {
                categoryFilter.value = 'all';
            }
        }

        filterButtons.forEach(function(item) {
            item.classList.toggle('active', item.dataset.filter === activeFilter);
        });
    }

    function syncSearchToUrl(query, category, filter) {
        const params = new URLSearchParams(window.location.search);

        if (query) {
            params.set('q', query);
        } else {
            params.delete('q');
        }

        if (category && category !== 'all') {
            params.set('category', category);
        } else {
            params.delete('category');
        }

        if (filter && filter !== 'all') {
            params.set('filter', filter);
        } else {
            params.delete('filter');
        }

        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
    }

    function formatDate(value) {
        if (!value) {
            return 'Recently shared';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'Recently shared';
        }

        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function trimText(text, length) {
        const safeText = text || '';
        if (safeText.length <= length) {
            return safeText;
        }

        return `${safeText.slice(0, length - 1).trim()}...`;
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function renderProfileAvatar(photo, initials) {
        const avatar = document.getElementById('profileAvatar');
        if (!avatar) {
            return;
        }

        if (app.isImageUrl(photo)) {
            avatar.textContent = '';
            avatar.style.backgroundImage = `url("${photo}")`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.style.backgroundRepeat = 'no-repeat';
            avatar.setAttribute('aria-label', 'Profile photo');
            return;
        }

        avatar.textContent = initials;
        avatar.style.backgroundImage = '';
        avatar.style.backgroundSize = '';
        avatar.style.backgroundPosition = '';
        avatar.style.backgroundRepeat = '';
        avatar.removeAttribute('aria-label');
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function debounce(func, wait) {
        let timeoutId;
        return function() {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(function() {
                func();
            }, wait);
        };
    }
});
