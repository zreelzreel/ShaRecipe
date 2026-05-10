document.addEventListener('DOMContentLoaded', async function() {
    const app = window.ShaRecipeApp;
    await app.ready;

    const currentUser = app.requireAdmin();
    if (!currentUser) {
        return;
    }

    let selectedRecipeId = '';
    const reviewModal = document.getElementById('reviewModal');
    const reviewModalContent = document.getElementById('reviewModalContent');

    setText('adminUser', currentUser.username);
    document.getElementById('logoutBtn')?.addEventListener('click', function() {
        app.logout();
    });
    document.querySelectorAll('[data-close-review-modal]').forEach(function(control) {
        control.addEventListener('click', closeReviewModal);
    });
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && reviewModal && !reviewModal.hidden) {
            closeReviewModal();
        }
    });

    rerenderAll();

    function renderOverview() {
        const approvedRecipes = app.getApprovedRecipes();
        const pendingRecipes = app.recipes.filter(function(recipe) {
            return app.normalizeRecipeStatus(recipe.status) === 'pending';
        });

        setText('totalRecipes', app.recipes.length);
        setText('pendingRecipes', pendingRecipes.length);
        setText('availableRecipes', approvedRecipes.length);
    }

    function renderRecipes() {
        const tbody = document.getElementById('recipesTableBody');
        if (!tbody) {
            return;
        }

        if (app.recipes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5">No recipes available.</td></tr>';
            selectedRecipeId = '';
            return;
        }

        const recipes = app.recipes.slice().sort(function(left, right) {
            const leftPending = app.normalizeRecipeStatus(left.status) === 'pending' ? 0 : 1;
            const rightPending = app.normalizeRecipeStatus(right.status) === 'pending' ? 0 : 1;
            if (leftPending !== rightPending) {
                return leftPending - rightPending;
            }
            return new Date(right.createdAt) - new Date(left.createdAt);
        });

        if (!recipes.some(function(recipe) { return recipe.id === selectedRecipeId; })) {
            selectedRecipeId = '';
        }

        tbody.innerHTML = recipes.map(function(recipe) {
            const status = app.normalizeRecipeStatus(recipe.status);
            const isSelected = recipe.id === selectedRecipeId;
            const actions = status === 'pending'
                ? `
                        <button class="btn btn-secondary btn-sm" type="button" data-review-recipe="${recipe.id}">Review</button>
                        <button class="delete-btn" type="button" data-delete-recipe="${recipe.id}">Delete</button>
                    `
                : '<span class="results-copy">Locked</span>';
            return `
                <tr class="${isSelected ? 'is-selected-row' : ''}">
                    <td>${escapeHtml(recipe.title || 'Untitled recipe')}</td>
                    <td>${escapeHtml(app.getCreatorName(recipe))}</td>
                    <td><span class="status-pill status-${status}">${escapeHtml(app.getRecipeStatusLabel(status))}</span></td>
                    <td>${formatDate(recipe.createdAt)}</td>
                    <td class="admin-actions-cell">
                        ${actions}
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('[data-review-recipe]').forEach(function(button) {
            button.addEventListener('click', function() {
                selectedRecipeId = button.dataset.reviewRecipe;
                renderRecipes();
                renderReviewPanel();
                openReviewModal();
            });
        });

        tbody.querySelectorAll('[data-delete-recipe]').forEach(function(button) {
            button.addEventListener('click', async function() {
                await app.deleteRecipe(button.dataset.deleteRecipe);
                rerenderAll();
            });
        });
    }

    function renderReviewPanel() {
        const panel = document.getElementById('reviewPanelContent');
        if (!panel || !reviewModalContent) {
            return;
        }

        const recipe = app.recipes.find(function(entry) {
            return entry.id === selectedRecipeId;
        });

        if (!recipe) {
            panel.innerHTML = 'Click <strong>Review</strong> on a pending recipe to open the full review pop-up.';
            reviewModalContent.innerHTML = '';
            closeReviewModal();
            return;
        }

        const status = app.normalizeRecipeStatus(recipe.status);
        const ingredients = Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0 ? recipe.ingredients : ['No ingredients listed.'];
        const steps = Array.isArray(recipe.steps) && recipe.steps.length > 0 ? recipe.steps : ['No steps listed.'];
        const creatorName = escapeHtml(app.getCreatorName(recipe));
        const categoryName = escapeHtml(app.normalizeRecipeCategory(recipe.category));
        const statusLabel = escapeHtml(app.getRecipeStatusLabel(status));
        const postedDate = formatDate(recipe.createdAt);
        const reviewDate = recipe.reviewedAt ? formatDate(recipe.reviewedAt) : 'Not reviewed yet';

        panel.innerHTML = `
            <div class="review-panel-summary">
                <span class="review-panel-status status-pill status-${status}">${statusLabel}</span>
                <strong>${escapeHtml(recipe.title || 'Untitled recipe')}</strong>
                <p>Open the pop-up to inspect the photo, ingredients, steps, and remarks form.</p>
            </div>
        `;

        reviewModalContent.innerHTML = `
            <div class="review-modal-hero">
                <div class="review-modal-copy">
                    <p class="admin-eyebrow">Recipe review</p>
                    <h2 id="reviewModalTitle">${escapeHtml(recipe.title || 'Untitled recipe')}</h2>
                    <p class="review-modal-description">${escapeHtml(recipe.description || 'No description available.')}</p>
                    <div class="review-modal-meta">
                        <article>
                            <span>Creator</span>
                            <strong>${creatorName}</strong>
                        </article>
                        <article>
                            <span>Category</span>
                            <strong>${categoryName}</strong>
                        </article>
                        <article>
                            <span>Posted</span>
                            <strong>${postedDate}</strong>
                        </article>
                        <article>
                            <span>Status</span>
                            <strong>${statusLabel}</strong>
                        </article>
                    </div>
                </div>
                <div class="review-modal-media">
                    <div class="review-modal-status-wrap">
                        <span class="status-pill status-${status}">${statusLabel}</span>
                    </div>
                    <div class="review-image-shell review-modal-image">
                        ${renderRecipeMedia(recipe)}
                    </div>
                </div>
            </div>

            <div class="review-modal-body">
                <div class="review-list-grid review-modal-lists">
                    <section>
                        <h4>Ingredients</h4>
                        <ul>${ingredients.map(function(item) { return `<li>${escapeHtml(item)}</li>`; }).join('')}</ul>
                    </section>
                    <section>
                        <h4>Steps</h4>
                        <ol>${steps.map(function(item) { return `<li>${escapeHtml(item)}</li>`; }).join('')}</ol>
                    </section>
                </div>

                <div class="review-form-card review-modal-form-card">
                    <div class="review-form-topline">
                        <div>
                            <p class="panel-kicker">Decision</p>
                            <h3>Review notes</h3>
                        </div>
                        <div class="results-copy">Last review: ${escapeHtml(reviewDate)}</div>
                    </div>
                    ${status === 'pending'
                        ? `
                            <div class="form-group">
                                <label for="reviewRemarks">Remarks</label>
                                <textarea id="reviewRemarks" rows="6" placeholder="Tell the user what you checked and why you approve or reject this recipe.">${escapeHtml(recipe.reviewRemarks || '')}</textarea>
                            </div>
                            <div id="reviewError" class="error-message"></div>
                            <div class="review-form-actions">
                                <button type="button" class="btn btn-success" data-review-action="approved">Approve recipe</button>
                                <button type="button" class="btn btn-secondary" data-review-action="rejected">Reject recipe</button>
                            </div>
                        `
                        : `
                            <div class="form-group">
                                <label>Remarks</label>
                                <textarea rows="6" disabled>${escapeHtml(recipe.reviewRemarks || 'No remarks recorded.')}</textarea>
                            </div>
                            <div class="results-copy">This recipe is already ${escapeHtml(app.getRecipeStatusLabel(status).toLowerCase())} and can no longer be changed here.</div>
                        `}
                </div>
            </div>
        `;

        reviewModalContent.querySelectorAll('[data-review-action]').forEach(function(button) {
            button.addEventListener('click', async function() {
                const remarks = reviewModalContent.querySelector('#reviewRemarks')?.value.trim() || '';
                const error = reviewModalContent.querySelector('#reviewError');
                if (error) {
                    error.textContent = '';
                }

                const result = await app.reviewRecipe(recipe.id, {
                    status: button.dataset.reviewAction,
                    reviewRemarks: remarks
                });

                if (!result || !result.ok) {
                    if (error) {
                        error.textContent = result?.error || 'Unable to save this review right now.';
                    }
                    return;
                }

                selectedRecipeId = '';
                rerenderAll();
                closeReviewModal();
            });
        });
    }

    function renderUsers() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) {
            return;
        }

        const regularUsers = app.users
            .filter(function(user) {
                return user.role !== 'admin';
            });

        if (regularUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4">No registered users yet.</td></tr>';
            return;
        }

        tbody.innerHTML = regularUsers
            .map(function(user) {
                return `
                    <tr>
                        <td>${escapeHtml(app.getDisplayName(user))}</td>
                        <td>${escapeHtml(user.email || 'No email')}</td>
                        <td>${formatDate(user.createdAt)}</td>
                        <td><button class="delete-btn" type="button" data-delete-user="${user.id}">Remove</button></td>
                    </tr>
                `;
            }).join('');

        tbody.querySelectorAll('[data-delete-user]').forEach(function(button) {
            button.addEventListener('click', async function() {
                await app.deleteUser(button.dataset.deleteUser);
                rerenderAll();
            });
        });
    }

    function rerenderAll() {
        renderOverview();
        renderRecipes();
        renderReviewPanel();
        renderUsers();
    }

    function openReviewModal() {
        if (!reviewModal) {
            return;
        }

        reviewModal.hidden = false;
        document.body.classList.add('is-review-modal-open');
    }

    function closeReviewModal() {
        if (!reviewModal) {
            return;
        }

        reviewModal.hidden = true;
        document.body.classList.remove('is-review-modal-open');
    }

    function renderRecipeMedia(recipe) {
        if (app.isImageUrl(recipe.image)) {
            return `<img src="${recipe.image}" alt="${escapeHtml(recipe.title || 'Recipe image')}">`;
        }

        return '<div class="review-image-fallback">No photo</div>';
    }

    function formatDate(value) {
        if (!value) {
            return 'Unknown';
        }

        const date = new Date(value);
        return Number.isNaN(date.getTime())
            ? 'Unknown'
            : date.toLocaleDateString(undefined, {
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
