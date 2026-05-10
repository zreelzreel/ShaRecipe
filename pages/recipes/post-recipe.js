document.addEventListener('DOMContentLoaded', async function() {
    const app = window.ShaRecipeApp;
    await app.ready;

    const currentUser = app.requireUser();
    if (!currentUser) {
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const editRecipeId = urlParams.get('edit');
    const postForm = document.getElementById('postForm');
    const errorDiv = document.getElementById('postError');
    const successDiv = document.getElementById('postSuccess');
    const imageInput = document.getElementById('recipeImageFile');
    const preview = document.getElementById('recipeUploadPreview');
    const previewImage = document.getElementById('recipePreviewImage');
    const previewPlaceholder = document.getElementById('recipeUploadPlaceholder');
    const imageStatus = document.getElementById('recipeImageStatus');
    const choosePhotoBtn = document.getElementById('choosePhotoBtn');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    const dashboardBtn = document.getElementById('dashboardBtn');
    const heading = document.getElementById('postHeading');
    const intro = document.getElementById('postIntro');
    const submitBtn = document.getElementById('submitRecipeBtn');
    const pendingNote = document.getElementById('postPendingNote');

    let selectedImage = '';
    let editingRecipe = null;

    setText('postUser', app.getDisplayName(currentUser));
    clearPreview();

    dashboardBtn?.addEventListener('click', function() {
        app.goToDashboard();
    });

    choosePhotoBtn?.addEventListener('click', function() {
        imageInput?.click();
    });

    removePhotoBtn?.addEventListener('click', function() {
        if (imageInput) {
            imageInput.value = '';
        }
        clearPreview();
    });

    if (editRecipeId) {
        editingRecipe = app.recipes.find((recipe) => recipe.id === editRecipeId) || null;
        if (!editingRecipe || editingRecipe.userId !== currentUser.id) {
            showError('You can only edit your own recipe.');
            window.setTimeout(function() {
                app.goToDashboard();
            }, 1200);
            return;
        }

        hydrateFormForEdit(editingRecipe);
    }

    imageInput?.addEventListener('change', function() {
        const [file] = this.files || [];
        if (!file) {
            clearPreview();
            return;
        }

        if (!file.type.startsWith('image/')) {
            showError('Please upload a valid image file.');
            this.value = '';
            clearPreview();
            return;
        }

        const reader = new FileReader();
        reader.onload = function() {
            selectedImage = typeof reader.result === 'string' ? reader.result : '';
            preview.classList.remove('is-empty');
            preview.classList.add('has-image');
            previewImage.src = selectedImage;
            previewImage.hidden = false;
            previewPlaceholder.hidden = true;
            if (imageStatus) {
                imageStatus.textContent = file.name + ' is ready to upload.';
            }
            if (removePhotoBtn) {
                removePhotoBtn.disabled = false;
            }
            errorDiv.textContent = '';
        };
        reader.onerror = function() {
            showError('The image could not be read. Please try another file.');
            imageInput.value = '';
            clearPreview();
        };
        reader.readAsDataURL(file);
    });

    postForm?.addEventListener('submit', async function(event) {
        event.preventDefault();

        const recipeData = {
            image: selectedImage,
            title: document.getElementById('recipeTitle').value.trim(),
            description: document.getElementById('recipeDesc').value.trim(),
            category: document.getElementById('recipeCategory').value,
            creator: app.getDisplayName(currentUser),
            ingredients: splitList(document.getElementById('recipeIngredients').value)
                .filter(Boolean),
            steps: splitList(document.getElementById('recipeSteps').value)
                .filter(Boolean)
        };

        if (recipeData.title.length < 5) {
            showError('Title must be at least 5 characters.');
            return;
        }

        if (recipeData.description.length < 10) {
            showError('Description must be at least 10 characters.');
            return;
        }

        if (!recipeData.image) {
            showError('Please upload a food photo for the recipe.');
            return;
        }

        if (recipeData.ingredients.length === 0 || recipeData.steps.length === 0) {
            showError('Please add at least one ingredient and one step.');
            return;
        }

        const recipe = editingRecipe
            ? await app.updateRecipe(editingRecipe.id, recipeData)
            : await app.addRecipe(recipeData);
        if (!recipe) {
            showError(editingRecipe ? 'The recipe could not be updated. Please try again.' : 'The recipe could not be saved. Please try again.');
            return;
        }

        showSuccess(editingRecipe
            ? 'Recipe updated and sent back for checking. Redirecting to detail page...'
            : 'Recipe submitted and marked pending. Redirecting to dashboard...');
        setTimeout(function() {
            window.location.href = editingRecipe
                ? `${app.pagePath('recipe-detail.html')}?id=${encodeURIComponent(recipe.id)}`
                : app.pagePath('dashboard.html');
        }, 1600);
    });

    function clearPreview() {
        selectedImage = '';
        preview.classList.add('is-empty');
        preview.classList.remove('has-image');
        previewImage.hidden = true;
        previewImage.removeAttribute('src');
        previewPlaceholder.hidden = false;
        if (imageStatus) {
            imageStatus.textContent = 'No file selected yet.';
        }
        if (removePhotoBtn) {
            removePhotoBtn.disabled = true;
        }
    }

    function showError(message) {
        errorDiv.textContent = message;
        successDiv.style.display = 'none';
    }

    function showSuccess(message) {
        successDiv.textContent = message;
        successDiv.style.display = 'block';
        errorDiv.textContent = '';
    }

    function splitList(value) {
        return String(value || '')
            .split(/\r?\n|,/)
            .map(item => item.trim());
    }

    function hydrateFormForEdit(recipe) {
        if (heading) {
            heading.textContent = 'Edit your recipe.';
        }
        if (intro) {
            intro.textContent = 'Update the recipe photo, ingredients, and steps, then send it back for another check.';
        }
        if (submitBtn) {
            submitBtn.textContent = 'Save and Resubmit';
        }
        if (pendingNote) {
            pendingNote.innerHTML = `Current status: <strong>${escapeHtml(app.getRecipeStatusLabel(recipe.status))}</strong>. Saving changes will return this recipe to <strong>Pending</strong>.`;
        }

        document.getElementById('recipeTitle').value = recipe.title || '';
        document.getElementById('recipeDesc').value = recipe.description || '';
        document.getElementById('recipeCategory').value = app.normalizeRecipeCategory(recipe.category);
        document.getElementById('recipeIngredients').value = Array.isArray(recipe.ingredients) ? recipe.ingredients.join(', ') : '';
        document.getElementById('recipeSteps').value = Array.isArray(recipe.steps) ? recipe.steps.join(', ') : '';

        if (recipe.image) {
            selectedImage = recipe.image;
            preview.classList.remove('is-empty');
            preview.classList.add('has-image');
            previewImage.src = recipe.image;
            previewImage.hidden = false;
            previewPlaceholder.hidden = true;
            if (imageStatus) {
                imageStatus.textContent = 'Current recipe photo is loaded.';
            }
            if (removePhotoBtn) {
                removePhotoBtn.disabled = false;
            }
        }
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
