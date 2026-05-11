document.addEventListener('DOMContentLoaded', async function() {
    const app = window.ShaRecipeApp;
    if (!app) {
        return;
    }

    await app.ready;

    const urlParams = new URLSearchParams(window.location.search);
    const recipeId = urlParams.get('id');

    if (!recipeId) {
        window.location.href = 'home.html';
        return;
    }

    const currentUser = app.requireUser();
    if (!currentUser) {
        return;
    }

    let recipe = app.recipes.find(function(entry) {
        return entry.id === recipeId;
    });

    if (!recipe || !app.isRecipeVisibleToUser(recipe, currentUser)) {
        window.location.href = 'home.html';
        return;
    }

    const ingredients = Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
        ? recipe.ingredients
        : ['Secret ingredient!'];
    const steps = Array.isArray(recipe.steps) && recipe.steps.length > 0
        ? recipe.steps
        : ['Follow your heart.'];
    const recipeImage = document.getElementById('recipeImage');
    const recipeImageFallback = document.getElementById('recipeImageFallback');
    const hasPhoto = isImageUrl(recipe.image);
    const openRecipeBtn = document.getElementById('getRecipeBtn');
    const favoriteBtn = document.getElementById('favoriteBtn');
    const editRecipeBtn = document.getElementById('editRecipeBtn');
    const deleteRecipeBtn = document.getElementById('deleteRecipeBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const cookingSections = document.getElementById('cookingSections');
    const closeCookingBtn = document.getElementById('closeCookingBtn');
    const reviewStatusCard = document.getElementById('reviewStatusCard');
    const isOwner = recipe.userId === currentUser.id;
    const status = app.normalizeRecipeStatus(recipe.status);
    let favoritePending = false;
    let deletePending = false;

    const unsubscribeData = app.subscribeToData(function() {
        const refreshedUser = app.getCurrentUser();
        if (!refreshedUser) {
            app.goToLanding();
            return;
        }

        const refreshedRecipe = app.recipes.find(function(entry) {
            return entry.id === recipeId;
        });

        if (!refreshedRecipe || !app.isRecipeVisibleToUser(refreshedRecipe, refreshedUser)) {
            app.goToUserHome();
            return;
        }

        const recipeChanged = refreshedRecipe.likes !== recipe.likes
            || refreshedRecipe.status !== recipe.status
            || refreshedRecipe.title !== recipe.title
            || refreshedRecipe.description !== recipe.description
            || refreshedRecipe.image !== recipe.image
            || refreshedRecipe.reviewRemarks !== recipe.reviewRemarks
            || JSON.stringify(refreshedRecipe.ingredients || []) !== JSON.stringify(recipe.ingredients || [])
            || JSON.stringify(refreshedRecipe.steps || []) !== JSON.stringify(recipe.steps || []);

        if (recipeChanged) {
            recipe = refreshedRecipe;
            window.location.reload();
        }
    });

    window.addEventListener('pagehide', unsubscribeData);

    setText('detailUser', app.getDisplayName(currentUser));
    setText('recipeTitle', recipe.title);
    setText('recipeCreator', app.getCreatorName(recipe) || 'ShaRecipe cook');
    setText('recipeDescription', recipe.description || 'No description available.');
    setText('recipePrice', app.normalizeRecipeCategory(recipe.category));
    setText('recipeDate', formatDate(recipe.createdAt));
    document.title = `${recipe.title} - ShaRecipe`;

    if (openRecipeBtn) {
        openRecipeBtn.textContent = status === 'approved' ? 'Start Cooking' : 'Preview Recipe';
    }
    if (editRecipeBtn && !isOwner) {
        editRecipeBtn.remove();
    }
    if (deleteRecipeBtn && !isOwner) {
        deleteRecipeBtn.remove();
    }
    if (favoriteBtn && (status !== 'approved' || isOwner)) {
        favoriteBtn.hidden = true;
    }

    if (reviewStatusCard) {
        reviewStatusCard.hidden = true;
    }

    recipeImage.hidden = !hasPhoto;
    recipeImageFallback.hidden = hasPhoto;

    if (hasPhoto) {
        recipeImage.src = recipe.image;
    } else {
        recipeImageFallback.textContent = '';
    }

    const ingredientsList = document.getElementById('ingredientsList');
    const stepsList = document.getElementById('stepsList');

    if (ingredientsList) {
        ingredientsList.innerHTML = ingredients.map(function(ingredient) {
            return `<li>${escapeHtml(ingredient)}</li>`;
        }).join('');
    }

    if (stepsList) {
        stepsList.innerHTML = steps.map(function(step) {
            return `<li>${escapeHtml(step)}</li>`;
        }).join('');
    }

    document.getElementById('logoutBtn')?.addEventListener('click', function() {
        app.logout();
    });

    dashboardBtn?.addEventListener('click', function() {
        app.goToDashboard();
    });

    document.getElementById('backBtn')?.addEventListener('click', function() {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        window.location.href = 'home.html';
    });

    openRecipeBtn?.addEventListener('click', function() {
        if (cookingSections) {
            cookingSections.hidden = false;
        }

        openRecipeBtn.textContent = status === 'approved' ? 'Continue Cooking' : 'Continue Preview';

        document.getElementById('ingredientsList')?.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    });

    closeCookingBtn?.addEventListener('click', function() {
        if (cookingSections) {
            cookingSections.hidden = true;
        }

        if (openRecipeBtn) {
            openRecipeBtn.textContent = status === 'approved' ? 'Start Cooking' : 'Preview Recipe';
            openRecipeBtn.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    });

    updateFavoriteButton(app.isRecipeFavorited(recipe.id), Number(recipe.likes || 0));

    favoriteBtn?.addEventListener('click', async function() {
        if (favoritePending) {
            return;
        }

        favoritePending = true;
        favoriteBtn.disabled = true;

        const result = await app.toggleFavoriteRecipe(recipe.id);
        if (!result) {
            app.showToast('Unable to update likes right now.');
            favoriteBtn.disabled = false;
            favoritePending = false;
            return;
        }

        updateFavoriteButton(result.isFavorited, result.likes);
        app.showToast(result.isFavorited ? 'Post liked.' : 'Like removed.');
        favoriteBtn.disabled = false;
        favoritePending = false;
    });

    if (editRecipeBtn && isOwner) {
        editRecipeBtn.hidden = false;
        editRecipeBtn.addEventListener('click', function() {
            window.location.href = `post-recipe.html?edit=${encodeURIComponent(recipe.id)}`;
        });
    }

    if (deleteRecipeBtn && isOwner) {
        deleteRecipeBtn.hidden = false;
        deleteRecipeBtn.addEventListener('click', async function() {
            if (deletePending) {
                return;
            }

            const confirmed = window.confirm('Delete this recipe permanently? This action cannot be undone.');
            if (!confirmed) {
                return;
            }

            deletePending = true;
            deleteRecipeBtn.disabled = true;
            deleteRecipeBtn.textContent = 'Deleting...';

            const deleted = await app.deleteRecipe(recipe.id);
            if (!deleted) {
                app.showToast('Unable to delete this recipe right now.');
                deleteRecipeBtn.disabled = false;
                deleteRecipeBtn.textContent = 'Delete Recipe';
                deletePending = false;
                return;
            }

            window.location.href = app.pagePath('dashboard.html');
        });
    }

    function updateFavoriteButton(isFavorited, likes) {
        if (!favoriteBtn || favoriteBtn.hidden) {
            return;
        }

        const likeCount = Number(likes || 0);
        favoriteBtn.textContent = isFavorited
            ? `Liked (${likeCount})`
            : `Like (${likeCount})`;
        favoriteBtn.classList.toggle('active', isFavorited);
        favoriteBtn.setAttribute('aria-pressed', String(isFavorited));
    }

    function isImageUrl(value) {
        return app.isImageUrl(value);
    }

    function formatDate(value) {
        if (!value) {
            return 'Today';
        }

        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'Today';
        }

        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    function setText(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
});
