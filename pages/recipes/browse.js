document.addEventListener('DOMContentLoaded', async function() {
    const app = window.ShaRecipeApp;
    await app.ready;

    let currentUser = app.requireUser();
    if (!currentUser) {
        return;
    }

    const activeFilterButton = document.querySelector('.filter-btn.active');
    const browseSearchForm = document.getElementById('browseSearchForm');
    const userNameElement = document.getElementById('userName');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const categoryFilter = document.getElementById('categoryFilter');
    if (userNameElement) {
        userNameElement.textContent = app.getDisplayName(currentUser);
    }

    const initialSearchState = readSearchFromUrl();
    hydrateCategoryFilter();
    applySearchState(initialSearchState);

    document.getElementById('postBtn').addEventListener('click', () => {
        window.location.href = 'post-recipe.html';
    });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        app.logout();
    });

    dashboardBtn?.addEventListener('click', () => {
        app.goToDashboard();
    });

    document.getElementById('searchInput').addEventListener('input', debounce(renderRecipes, 300));
    browseSearchForm?.addEventListener('submit', function(event) {
        event.preventDefault();
        renderRecipes();
    });
    categoryFilter?.addEventListener('change', renderRecipes);

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const activeButton = document.querySelector('.filter-btn.active');
            if (activeButton) {
                activeButton.classList.remove('active');
            }

            this.classList.add('active');
            renderRecipes();
        });
    });

    document.getElementById('recipeGrid').addEventListener('click', function(event) {
        const viewButton = event.target.closest('[data-recipe-id]');
        if (!viewButton) {
            return;
        }

        window.location.href = `recipe-detail.html?id=${viewButton.dataset.recipeId}`;
    });

    renderRecipes();

    const unsubscribeData = app.subscribeToData(function() {
        const refreshedUser = app.getCurrentUser();
        if (!refreshedUser) {
            app.goToLanding();
            return;
        }

        currentUser = refreshedUser;
        if (userNameElement) {
            userNameElement.textContent = app.getDisplayName(currentUser);
        }
        renderRecipes();
    });

    window.addEventListener('pagehide', unsubscribeData);

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

    function renderRecipes() {
        const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
        const activeFilter = (document.querySelector('.filter-btn.active') || activeFilterButton)?.dataset.filter || 'all';
        const activeCategory = categoryFilter?.value || 'all';

        const filteredRecipes = app.getVisibleRecipesForUser(currentUser).filter(recipe => {
            const status = app.normalizeRecipeStatus(recipe.status);
            const category = app.normalizeRecipeCategory(recipe.category);
            const matchesSearch = app.recipeMatchesSearch(recipe, searchTerm);
            const matchesFilter = activeFilter === 'mine'
                ? recipe.userId === currentUser.id && status !== 'rejected'
                : status === 'approved';
            const matchesCategory = activeCategory === 'all' || category === activeCategory;

            return matchesSearch && matchesFilter && matchesCategory;
        }).sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

        syncSearchToUrl(searchTerm, activeCategory, activeFilter);

        const grid = document.getElementById('recipeGrid');
        if (filteredRecipes.length === 0) {
            grid.innerHTML = `
                <div class="empty-state">
                    <h2>No recipes matched your search.</h2>
                    <p>Try a different keyword or switch to your own recipes.</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = filteredRecipes.map(recipe => `
                <article class="recipe-card card">
                    <div class="recipe-image">
                        ${renderRecipeMedia(recipe)}
                    </div>
                    <div class="recipe-content">
                        <div class="recipe-meta">
                            <span class="price-tag">${escapeHtml(app.normalizeRecipeCategory(recipe.category))}</span>
                            <span class="creator">by ${escapeHtml(app.getCreatorName(recipe) || 'ShaRecipe cook')}</span>
                        </div>
                        <h2 class="recipe-title">${escapeHtml(recipe.title || 'Untitled recipe')}</h2>
                        <p class="recipe-desc">${escapeHtml(recipe.description || 'No description available.')}</p>
                        <button class="post-btn btn btn-primary" type="button" data-recipe-id="${recipe.id}">View Recipe</button>
                    </div>
                </article>
            `).join('');
    }

    function renderRecipeMedia(recipe) {
        if (app.isImageUrl(recipe.image)) {
            return `<img class="recipe-photo" src="${recipe.image}" alt="${escapeHtml(recipe.title)}">`;
        }

        return '<span class="recipe-photo-fallback" aria-hidden="true"></span>';
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
        const searchField = document.getElementById('searchInput');
        if (searchField) {
            searchField.value = state.query;
        }

        if (categoryFilter) {
            categoryFilter.value = state.category;
            if (categoryFilter.value !== state.category) {
                categoryFilter.value = 'all';
            }
        }

        document.querySelectorAll('.filter-btn').forEach(function(button) {
            button.classList.toggle('active', button.dataset.filter === (state.filter === 'mine' ? 'mine' : 'all'));
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

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };

            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
});
