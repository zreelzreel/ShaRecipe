document.addEventListener('DOMContentLoaded', async function() {
    const app = window.ShaRecipeApp;
    if (!app) {
        return;
    }

    await app.ready;

    const activeUser = app.requireUser();
    if (!activeUser) {
        return;
    }

    const logoutBtn = document.getElementById('logoutBtn');
    const browseBtn = document.getElementById('browseBtn');
    const postBtn = document.getElementById('postBtn');
    const profilePhotoInput = document.getElementById('profilePhotoInput');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    const photoEditorModal = document.getElementById('photoEditorModal');
    const photoEditorStage = document.getElementById('photoEditorStage');
    const photoEditorImage = document.getElementById('photoEditorImage');
    const photoZoomInput = document.getElementById('photoZoomInput');
    const savePhotoEditorBtn = document.getElementById('savePhotoEditorBtn');
    const resetPhotoEditorBtn = document.getElementById('resetPhotoEditorBtn');
    const closePhotoEditorBtn = document.getElementById('closePhotoEditorBtn');

    let user = sanitizeUser(activeUser);
    let editorState = createEditorState();

    hydrateProfile();
    loadProfileStats();
    loadMyRecentRecipes();

    window.addEventListener('storage', function(event) {
        if (event.key && event.key !== app.storageKeys.currentUser && event.key !== app.storageKeys.recipes && event.key !== app.storageKeys.users) {
            return;
        }

        const refreshedUser = app.getCurrentUser();
        if (!refreshedUser) {
            app.goToLanding();
            return;
        }

        user = sanitizeUser(refreshedUser);
        hydrateProfile();
        loadProfileStats();
        loadMyRecentRecipes();
    });

    logoutBtn?.addEventListener('click', function() {
        app.logout();
    });

    browseBtn?.addEventListener('click', function() {
        window.location.href = app.pagePath('home.html');
    });

    postBtn?.addEventListener('click', function() {
        window.location.href = app.pagePath('post-recipe.html');
    });

    profilePhotoInput?.addEventListener('change', function(event) {
        const [file] = event.target.files || [];
        if (!file) {
            profilePhotoInput.value = '';
            return;
        }

        if (!file.type.startsWith('image/')) {
            profilePhotoInput.value = '';
            app.showToast('Please choose a valid image file.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(loadEvent) {
            const result = typeof loadEvent.target.result === 'string' ? loadEvent.target.result : '';
            openPhotoEditor(result);
            profilePhotoInput.value = '';
        };
        reader.onerror = function() {
            if (profilePhotoInput) profilePhotoInput.value = '';
            app.showToast('Unable to read that image file.');
        };
        reader.readAsDataURL(file);
    });

    removePhotoBtn?.addEventListener('click', function() {
        const updated = app.updateCurrentUserProfile({ profilePhoto: '' });
        if (updated) {
            user = sanitizeUser(updated);
            hydrateProfile();
            if (profilePhotoInput) profilePhotoInput.value = '';
            app.showToast('Profile photo removed.');
        }
    });

    closePhotoEditorBtn?.addEventListener('click', closePhotoEditor);
    resetPhotoEditorBtn?.addEventListener('click', resetPhotoEditor);
    savePhotoEditorBtn?.addEventListener('click', saveCroppedPhoto);

    photoZoomInput?.addEventListener('input', function() {
        editorState.zoom = Number(this.value || 1);
        renderEditorImage();
    });

    photoEditorStage?.addEventListener('pointerdown', function(event) {
        if (!editorState.imageLoaded) {
            return;
        }

        editorState.dragging = true;
        editorState.pointerId = event.pointerId;
        editorState.dragStartX = event.clientX;
        editorState.dragStartY = event.clientY;
        editorState.startOffsetX = editorState.offsetX;
        editorState.startOffsetY = editorState.offsetY;
        photoEditorStage.classList.add('is-dragging');
        photoEditorStage.setPointerCapture(event.pointerId);
    });

    photoEditorStage?.addEventListener('pointermove', function(event) {
        if (!editorState.dragging || event.pointerId !== editorState.pointerId) {
            return;
        }

        editorState.offsetX = editorState.startOffsetX + (event.clientX - editorState.dragStartX);
        editorState.offsetY = editorState.startOffsetY + (event.clientY - editorState.dragStartY);
        clampOffsets();
        renderEditorImage();
    });

    photoEditorStage?.addEventListener('pointerup', stopDraggingEditor);
    photoEditorStage?.addEventListener('pointercancel', stopDraggingEditor);

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && photoEditorModal && !photoEditorModal.hidden) {
            closePhotoEditor();
        }
    });

    function hydrateProfile() {
        const displayName = getDisplayName(user);
        setText('userName', displayName);
        setText('userDisplayName', displayName);
        setText('profileEmail', user.email || 'Member account');
        renderProfilePhoto(user.profilePhoto, displayName);
        if (removePhotoBtn) {
            removePhotoBtn.disabled = !user.profilePhoto;
        }
    }

    function openPhotoEditor(imageSrc) {
        if (!photoEditorModal || !photoEditorImage || !photoEditorStage || !photoZoomInput) {
            const updated = app.updateCurrentUserProfile({ profilePhoto: imageSrc });
            if (updated) {
                user = sanitizeUser(updated);
                hydrateProfile();
                app.showToast('Profile photo updated.');
            }
            return;
        }

        editorState = createEditorState();
        photoEditorModal.hidden = false;
        document.body.style.overflow = 'hidden';
        photoZoomInput.value = '1';
        photoEditorImage.onload = function() {
            editorState.imageLoaded = true;
            resetPhotoEditor();
        };
        photoEditorImage.src = imageSrc;
    }

    function closePhotoEditor() {
        if (!photoEditorModal || !photoEditorImage) {
            return;
        }

        photoEditorModal.hidden = true;
        document.body.style.overflow = '';
        photoEditorImage.removeAttribute('src');
        editorState = createEditorState();
        if (photoEditorStage) {
            photoEditorStage.classList.remove('is-dragging');
        }
    }

    function resetPhotoEditor() {
        if (!photoEditorStage || !photoEditorImage || !photoZoomInput || !editorState.imageLoaded) {
            return;
        }

        const stageRect = photoEditorStage.getBoundingClientRect();
        const naturalWidth = photoEditorImage.naturalWidth || 1;
        const naturalHeight = photoEditorImage.naturalHeight || 1;
        editorState.stageSize = stageRect.width || 320;
        editorState.baseScale = Math.max(editorState.stageSize / naturalWidth, editorState.stageSize / naturalHeight);
        editorState.zoom = Number(photoZoomInput.value || 1);
        editorState.offsetX = 0;
        editorState.offsetY = 0;
        renderEditorImage();
    }

    function renderEditorImage() {
        if (!photoEditorImage || !photoEditorStage || !editorState.imageLoaded) {
            return;
        }

        const naturalWidth = photoEditorImage.naturalWidth || 1;
        const naturalHeight = photoEditorImage.naturalHeight || 1;
        const stageRect = photoEditorStage.getBoundingClientRect();
        editorState.stageSize = stageRect.width || editorState.stageSize || 320;

        const scale = editorState.baseScale * editorState.zoom;
        const width = naturalWidth * scale;
        const height = naturalHeight * scale;

        clampOffsets(width, height);

        photoEditorImage.style.width = `${width}px`;
        photoEditorImage.style.height = `${height}px`;
        photoEditorImage.style.transform = `translate(calc(-50% + ${editorState.offsetX}px), calc(-50% + ${editorState.offsetY}px))`;
    }

    function clampOffsets(currentWidth, currentHeight) {
        if (!photoEditorImage || !photoEditorStage || !editorState.imageLoaded) {
            return;
        }

        const stageSize = editorState.stageSize || photoEditorStage.getBoundingClientRect().width || 320;
        const scale = editorState.baseScale * editorState.zoom;
        const width = currentWidth || (photoEditorImage.naturalWidth || 1) * scale;
        const height = currentHeight || (photoEditorImage.naturalHeight || 1) * scale;
        const maxOffsetX = Math.max(0, (width - stageSize) / 2);
        const maxOffsetY = Math.max(0, (height - stageSize) / 2);

        editorState.offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, editorState.offsetX));
        editorState.offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, editorState.offsetY));
    }

    function stopDraggingEditor(event) {
        if (!photoEditorStage || !editorState.dragging) {
            return;
        }

        if (typeof event.pointerId === 'number' && photoEditorStage.hasPointerCapture(event.pointerId)) {
            photoEditorStage.releasePointerCapture(event.pointerId);
        }

        editorState.dragging = false;
        editorState.pointerId = null;
        photoEditorStage.classList.remove('is-dragging');
    }

    function saveCroppedPhoto() {
        if (!photoEditorImage || !editorState.imageLoaded) {
            return;
        }

        const naturalWidth = photoEditorImage.naturalWidth || 1;
        const naturalHeight = photoEditorImage.naturalHeight || 1;
        const stageSize = editorState.stageSize || photoEditorStage?.getBoundingClientRect().width || 320;
        const scale = editorState.baseScale * editorState.zoom;
        const renderedWidth = naturalWidth * scale;
        const renderedHeight = naturalHeight * scale;
        const sourceX = Math.max(0, ((renderedWidth - stageSize) / 2 - editorState.offsetX) / scale);
        const sourceY = Math.max(0, ((renderedHeight - stageSize) / 2 - editorState.offsetY) / scale);
        const sourceSize = Math.min(naturalWidth, naturalHeight, stageSize / scale);
        const canvas = document.createElement('canvas');
        const outputSize = 480;
        const context = canvas.getContext('2d');

        if (!context) {
            app.showToast('Unable to save this crop right now.');
            return;
        }

        canvas.width = outputSize;
        canvas.height = outputSize;
        context.drawImage(
            photoEditorImage,
            sourceX,
            sourceY,
            sourceSize,
            sourceSize,
            0,
            0,
            outputSize,
            outputSize
        );

        const result = canvas.toDataURL('image/jpeg', 0.92);
        const updated = app.updateCurrentUserProfile({ profilePhoto: result });
        if (updated) {
            user = sanitizeUser(updated);
            hydrateProfile();
            app.showToast('Profile photo updated.');
        }
        closePhotoEditor();
    }

    function createEditorState() {
        return {
            imageLoaded: false,
            baseScale: 1,
            zoom: 1,
            offsetX: 0,
            offsetY: 0,
            stageSize: 320,
            dragging: false,
            pointerId: null,
            dragStartX: 0,
            dragStartY: 0,
            startOffsetX: 0,
            startOffsetY: 0
        };
    }

    function loadProfileStats() {
        const recipes = Array.isArray(app.recipes) ? app.recipes : [];
        const myRecipes = recipes.filter(function(recipe) {
            return recipe.userId === user.id && app.normalizeRecipeStatus(recipe.status) !== 'rejected';
        });
        const totalLikes = myRecipes.reduce(function(sum, recipe) {
            return sum + Number(recipe.likes || 0);
        }, 0);

        let joinedYear = new Date().getFullYear();
        if (user.createdAt) {
            const date = new Date(user.createdAt);
            if (!Number.isNaN(date.getTime())) {
                joinedYear = date.getFullYear();
            }
        }

        setText('myRecipesCount', myRecipes.length);
        setText('likesCount', totalLikes);
        setText('joinedYear', joinedYear);
    }

    function loadMyRecentRecipes() {
        const recipes = Array.isArray(app.recipes) ? app.recipes : [];
        const myRecipes = recipes
            .filter(function(recipe) {
                return recipe.userId === user.id && app.normalizeRecipeStatus(recipe.status) !== 'rejected';
            })
            .sort(function(left, right) {
                const leftDate = new Date(left.createdAt || 0).getTime();
                const rightDate = new Date(right.createdAt || 0).getTime();
                return rightDate - leftDate;
            })
            .slice(0, 4);

        const container = document.getElementById('myRecentRecipes');
        if (!container) {
            return;
        }

        if (myRecipes.length === 0) {
            container.innerHTML = `
                <div class="dashboard-empty">
                    <h3>No recipes yet.</h3>
                    <p>You haven't posted any recipes yet. <a class="section-link" href="${app.pagePath('post-recipe.html')}">Create your first recipe</a>.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = myRecipes.map(function(recipe) {
            const recipeId = escapeHtml(recipe.id || '');
            const title = escapeHtml(recipe.title || 'Untitled recipe');
            const description = escapeHtml(trimText(recipe.description, 100) || 'No description available.');
            const category = escapeHtml(app.normalizeRecipeCategory(recipe.category));

            return `
                <article class="listing-card">
                    <div class="listing-media">
                        ${renderRecipeMedia(recipe)}
                        <span class="listing-tag">Mine</span>
                    </div>
                    <div class="listing-body">
                        <div class="listing-meta">
                            <span class="price-pill">${category}</span>
                            <span class="creator-name">by you</span>
                        </div>
                        <h3>${title}</h3>
                        <p>${description}</p>
                        <div class="listing-footer">
                            <small>${formatDate(recipe.createdAt)}</small>
                            <button class="btn btn-primary" type="button" data-recipe-id="${recipeId}">View Recipe</button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        container.querySelectorAll('[data-recipe-id]').forEach(function(button) {
            button.addEventListener('click', function() {
                window.location.href = `${app.pagePath('recipe-detail.html')}?id=${encodeURIComponent(button.dataset.recipeId)}`;
            });
        });
    }

    function renderRecipeMedia(recipe) {
        if (app.isImageUrl(recipe.image)) {
            return `<img class="listing-photo" src="${recipe.image}" alt="${escapeHtml(recipe.title || 'Recipe')}">`;
        }

        return '<span class="listing-image" aria-hidden="true"></span>';
    }

    function renderProfilePhoto(photo, username) {
        const initials = getInitials(username);
        const image = document.getElementById('profilePhoto');
        const fallback = document.getElementById('profilePhotoFallback');
        const badge = document.getElementById('userBadge');

        if (badge) {
            badge.textContent = initials;
        }
        if (fallback) {
            fallback.hidden = !!photo;
            fallback.textContent = initials;
        }

        if (photo && image) {
            image.src = photo;
            image.hidden = false;
        } else if (image) {
            image.hidden = true;
            image.src = '';
        }

        if (!photo && fallback) {
            fallback.hidden = false;
        }
    }

    function getDisplayName(profile) {
        if (profile.displayName && String(profile.displayName).trim()) {
            return String(profile.displayName).trim();
        }

        if (profile.username && String(profile.username).trim()) {
            return String(profile.username).trim();
        }

        if (profile.email && String(profile.email).trim()) {
            return String(profile.email).trim().split('@')[0];
        }

        return 'Member';
    }

    function getInitials(name) {
        if (!name) return 'SR';
        return name
            .split(/\s+/)
            .map(function(part) {
                return part[0];
            })
            .join('')
            .slice(0, 2)
            .toUpperCase();
    }

    function sanitizeUser(profile) {
        return {
            id: profile?.id || '',
            username: profile?.username || '',
            displayName: profile?.displayName || '',
            email: profile?.email || '',
            profilePhoto: typeof profile?.profilePhoto === 'string' ? profile.profilePhoto : '',
            createdAt: profile?.createdAt || ''
        };
    }

    function formatDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return 'Recently';
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

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
});
