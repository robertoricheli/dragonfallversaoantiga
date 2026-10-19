/**
 * Dragonfall — telas de LOGIN/REGISTRAR, perfil do jogador e fluxo pós-auth.
 */
(function (global) {
    "use strict";
    const doc = global.document;
    if (!doc) return;

    let gateResolver = null;
    let menuApiRef = null;
    let pendingAvatarId = null;
    let pendingBgId = null;

    function $(id) { return doc.getElementById(id); }

    const DEFAULT_DISPLAY_NAME = "Jogador Visitante";
    const FRAME_STYLE_IDS = Object.freeze(["gold", "silver", "ember", "frost", "void", "jade"]);
    const LS_FRAME = "df_profile_frameStyleId";
    const LS_STATS_HIDDEN = "df_profile_statsHidden";

    function profileAssetUrl(key) {
        return global.DfProfileAssets?.url?.(key) || ("bg/" + key);
    }

    function readLocal(key, fallback) {
        try {
            const v = global.localStorage?.getItem?.(key);
            return v == null ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    function writeLocal(key, value) {
        try { global.localStorage?.setItem?.(key, String(value)); } catch (e) { /* */ }
    }

    function normalizeFrameId(id) {
        const s = String(id || "").trim().toLowerCase();
        return FRAME_STYLE_IDS.includes(s) ? s : "gold";
    }

    function applyFrameStyle(frameId) {
        const id = normalizeFrameId(frameId);
        const el = $("df-profile-frame");
        if (!el) return id;
        for (const f of FRAME_STYLE_IDS) {
            el.classList.toggle("df-profile-frame--" + f, f === id);
        }
        el.setAttribute("data-frame", id);
        return id;
    }

    function loadFrameStyle() {
        const p = global.DfAuthClient?.getCachedPlayer?.();
        const fromProfile = p?.frameStyleId;
        const id = normalizeFrameId(fromProfile || readLocal(LS_FRAME, "gold"));
        applyFrameStyle(id);
        return id;
    }

    function cycleFrameStyle() {
        const current = normalizeFrameId(
            $("df-profile-frame")?.getAttribute("data-frame") || readLocal(LS_FRAME, "gold")
        );
        const idx = FRAME_STYLE_IDS.indexOf(current);
        const next = FRAME_STYLE_IDS[(idx + 1) % FRAME_STYLE_IDS.length];
        applyFrameStyle(next);
        writeLocal(LS_FRAME, next);
        try {
            global.DfAuthClient?.patchCachedPlayerFields?.({ frameStyleId: next });
        } catch (e) { /* */ }
        return next;
    }

    function isStatsHidden() {
        return readLocal(LS_STATS_HIDDEN, "0") === "1";
    }

    function applyStatsPrivacy(hidden) {
        const on = !!hidden;
        const box = $("df-profile-stats");
        const btn = $("btn-profile-privacy");
        if (box) box.classList.toggle("is-hidden", on);
        if (btn) {
            btn.setAttribute("aria-pressed", on ? "true" : "false");
            btn.setAttribute("aria-label", on ? "Mostrar estatísticas" : "Ocultar estatísticas");
            btn.textContent = on ? "👁‍🗨" : "👁";
        }
        writeLocal(LS_STATS_HIDDEN, on ? "1" : "0");
    }

    function toggleStatsPrivacy() {
        applyStatsPrivacy(!isStatsHidden());
    }

    function refreshPlaceholders() {
        const rank = $("df-profile-rank");
        if (rank) rank.textContent = "—";
        const season = $("df-profile-wr-season");
        const overall = $("df-profile-wr-overall");
        if (season) season.textContent = "--%";
        if (overall) overall.textContent = "--%";
        applyStatsPrivacy(isStatsHidden());
        loadFrameStyle();
    }

    function displayNameFor(p) {
        if (p?.displayName) return p.displayName;
        return DEFAULT_DISPLAY_NAME;
    }

    /** Nome para "Entrando como …" — displayName próprio ou e-mail. */
    function accountLabelFor(p) {
        const name = String(p?.displayName || "").trim();
        if (name && name !== DEFAULT_DISPLAY_NAME) return name;
        const email = String(p?.email || "").trim();
        if (email) return email;
        return displayNameFor(p);
    }

    function enteringAsMessage(p) {
        return "Entrando como " + accountLabelFor(p);
    }

    function announceEnteringAs(p) {
        const msg = enteringAsMessage(p);
        try { global.dfSetMenuLoadStatus?.(msg); } catch (e) { /* */ }
        try { global.dfSetUpdateUi?.(4, msg); } catch (e) { /* */ }
        void toast(msg, 1600);
        return msg;
    }

    function xpStatsFor(p) {
        if (p?.level != null && p?.xpInLevel != null && p?.xpToNext != null) {
            return {
                level: p.level,
                xpInLevel: p.xpInLevel,
                xpToNext: p.xpToNext,
            };
        }
        const total = p?.totalXp || 0;
        return global.DfProfileXp?.statsFromTotalXp?.(total)
            || { level: 1, xpInLevel: 0, xpToNext: 2 };
    }

    function heroList() {
        const defs = global.DfData?.heroDefs || global.heroDefs || [];
        return defs.map((h) => ({ id: h.id, name: h.name, image: h.image }));
    }

    function showLayer(id, on) {
        const el = $(id);
        if (!el) return;
        el.classList.toggle("active", !!on);
        el.setAttribute("aria-hidden", on ? "false" : "true");
    }

    function hideAllAuth() {
        try { doc.activeElement?.blur?.(); } catch (e) { /* */ }
        try { global.dfLockSoftKeyboardLayout?.(false); } catch (e) { /* */ }
        showLayer("df-auth-gate-layer", false);
        showLayer("df-auth-form-layer", false);
        showLayer("df-auth-forgot-layer", false);
        showProfilePage(false);
        try { global.DfLayout?.syncDesktopLayoutViewport?.() || global.DfLayout?.syncLayoutViewport?.(); } catch (e) { /* */ }
    }

    function openForgotForm() {
        showLayer("df-auth-form-layer", false);
        showLayer("df-auth-forgot-layer", true);
        const emailIn = $("df-forgot-email");
        const loginEmail = $("df-auth-email")?.value?.trim();
        if (emailIn) {
            emailIn.value = loginEmail || "";
            emailIn.focus();
        }
    }

    function closeForgotForm() {
        showLayer("df-auth-forgot-layer", false);
        showLayer("df-auth-form-layer", true);
    }

    async function toast(msg, ms = 1500) {
        const el = $("df-auth-toast");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("active");
        await new Promise((r) => setTimeout(r, ms));
        el.classList.remove("active");
    }

    async function banner(msg, ms = 3000) {
        const el = $("df-auth-banner");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("active");
        await new Promise((r) => setTimeout(r, ms));
        el.classList.remove("active");
    }

    function authErrorCode(err) {
        if (err?.code) return String(err.code);
        const msg = String(err?.message || "");
        if (/^[A-Z][A-Z0-9_]+$/.test(msg)) return msg;
        return "";
    }

    function authErrorMessage(err, fallback) {
        const code = authErrorCode(err);
        if (code === "EMAIL_IN_USE") return "E-mail já cadastrado.";
        if (code === "INVALID_CREDENTIALS") return "E-mail ou senha incorretos.";
        if (code === "PASSWORD_TOO_SHORT") return "Senha muito curta (mín. 6).";
        if (code === "AUTH_CLIENT_MISSING") {
            return "Módulo de login não carregou. Feche a aba, abra de novo pelo jogar-local.bat (ou limpe cache: Ctrl+Shift+R).";
        }
        if (code === "EMAIL_INVALID") return "E-mail inválido.";
        if (code === "PROFILE_CONFLICT") return "Conta atualizada em outro aparelho. Tente entrar de novo.";
        if (code === "SAVE_FAILED") return "Erro ao gravar sessão no servidor. Tente de novo.";
        if (code === "NETWORK_ERROR") {
            return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
        }
        if (code === "AUTH_PROXY_FAILED") {
            return "Servidor de contas indisponível. Aguarde ~30 segundos e tente de novo.";
        }
        if (code === "SERVER_UNAVAILABLE" || err?.status === 503) {
            return "Servidor de contas em manutenção. Tente em instantes.";
        }
        if (code === "LOGIN_NO_TOKEN" || code === "BAD_RESPONSE") {
            return "Resposta inválida do servidor. Atualize a página (F5) e tente de novo.";
        }
        if (code === "REQUEST_FAILED") {
            if (err?.status === 502) {
                return "Servidor de contas indisponível. Aguarde alguns segundos e tente de novo.";
            }
            return "Erro no servidor de contas. Tente de novo.";
        }
        if (code === "MAIL_NOT_CONFIGURED") {
            return "E-mail do jogo não configurado no servidor. Contate o suporte.";
        }
        if (code === "MAIL_BAD_CREDENTIALS") {
            return "Envio de e-mail falhou (credenciais). Contate o suporte.";
        }
        if (code === "MAIL_FAILED") {
            return "Não foi possível enviar o e-mail agora. Tente de novo em instantes.";
        }
        if (code === "PASSWORD_NOT_RECOVERABLE") {
            return err?.data?.hint === "LOGIN_ONCE"
                ? "Não foi possível enviar por e-mail agora. Entre com a senha que você lembra uma vez; depois Esqueci a senha volta a funcionar."
                : "Não foi possível recuperar a senha. Use a última senha recebida por e-mail.";
        }
        if (code === "FORGOT_COOLDOWN") {
            const sec = err?.data?.retryAfterSec || 90;
            return `Aguarde ${sec} segundos antes de pedir o e-mail de novo.`;
        }
        try {
            console.warn("[DfAuthUi] auth:", code || err?.message || err, err?.status || "");
        } catch (e) { /* */ }
        if (code) return `Não foi possível continuar (${code}). Tente de novo.`;
        return fallback;
    }

    /** Pipeline único de boot — evita duplicar download/progresso com o menu. */
    async function bootToHub(menuApi) {
        if (typeof menuApi?.bootToHubAfterAuth === "function") {
            hideAllAuth();
            return menuApi.bootToHubAfterAuth();
        }
        const player = global.DfAuthClient?.getCachedPlayer?.();
        if (player) announceEnteringAs(player);
        global.dfEnsureMenuSplashForLoad?.();
        $("main")?.classList.add("active", "main-splash-screen");
        global.dfBeginMenuLoadBar?.();
        global.dfSetUpdateUi?.(2, "Preparando o jogo…");
        try {
            const upd = await (global.dfEnsureGameUpdate?.({}) || Promise.resolve());
            if (upd && upd.mode === "reload") return;
            if (global.DfAppGate?.runBeforePlayMenu) {
                await Promise.race([
                    global.DfAppGate.runBeforePlayMenu(),
                    new Promise((r) => setTimeout(r, 8000)),
                ]);
            }
            global.dfSetUpdateUi?.(100, "Pronto!");
            await new Promise((r) => setTimeout(r, 180));
            hideAllAuth();
            $("main")?.classList.remove("active");
            if (menuApi?.showPlayMenu) menuApi.showPlayMenu();
            else $("play-menu")?.classList.add("active");
            syncHubProfile();
            global.DfHubSplash?.applySaved?.();
            global.dfPlayHubVideo?.();
        } catch (e) {
            global.dfSetUpdateUi?.(0, (e && e.message) || String(e));
            await new Promise((r) => setTimeout(r, 1800));
            throw e;
        } finally {
            global.dfShowMenuLoadBar?.(false);
            global.dfShowUpdateOverlay?.(false);
        }
    }

    function syncHubProfile() {
        const p = global.DfAuthClient?.getCachedPlayer?.();
        const label = $("df-hub-profile-name");
        const avatar = $("df-hub-profile-avatar");
        const levelNum = $("df-hub-profile-level-num");
        const stats = xpStatsFor(p);
        if (label) {
            label.textContent = displayNameFor(p);
        }
        if (levelNum) {
            levelNum.textContent = String(stats.level);
        }
        if (avatar) {
            const heroes = heroList();
            const heroId = p?.avatarHeroId || heroes[0]?.id;
            const h = heroes.find((x) => x.id === heroId) || heroes[0];
            if (h?.image) {
                avatar.src = heroImageUrl(h.image);
                avatar.alt = h.name;
            } else {
                avatar.src = profileAssetUrl("florabellaPortrait");
                avatar.alt = "";
            }
        }
        const btn = $("btn-hub-profile");
        if (btn) {
            btn.setAttribute("aria-label", p?.displayName
                ? "Perfil de " + p.displayName
                : "Perfil do herói");
        }
    }

    function bindPasswordToggle(btnId, inputId) {
        $(btnId)?.addEventListener("click", () => {
            const pass = $(inputId);
            const btn = $(btnId);
            if (!pass || !btn) return;
            const show = pass.type === "password";
            pass.type = show ? "text" : "password";
            btn.classList.toggle("visible", show);
            btn.setAttribute("aria-pressed", show ? "true" : "false");
            btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
        });
    }

    function clearProfilePasswordFields() {
        const ids = ["df-profile-current-password", "df-profile-new-password"];
        ids.forEach((id) => {
            const el = $(id);
            if (el) el.value = "";
        });
        ["btn-profile-current-pw-toggle", "btn-profile-new-pw-toggle"].forEach((id) => {
            const btn = $(id);
            if (btn) {
                btn.classList.remove("visible");
                btn.setAttribute("aria-pressed", "false");
                btn.setAttribute("aria-label", "Mostrar senha");
            }
        });
    }

    function resetPasswordVisibility() {
        const pass = $("df-auth-password");
        const btn = $("btn-auth-password-toggle");
        if (pass) pass.type = "password";
        if (btn) {
            btn.classList.remove("visible");
            btn.setAttribute("aria-pressed", "false");
            btn.setAttribute("aria-label", "Mostrar senha");
        }
    }

    function openForm(mode) {
        showLayer("df-auth-gate-layer", false);
        showLayer("df-auth-forgot-layer", false);
        showLayer("df-auth-form-layer", true);
        const title = $("df-auth-form-title");
        const forgot = $("df-auth-forgot");
        const submit = $("df-auth-submit");
        const email = $("df-auth-email");
        const pass = $("df-auth-password");
        if (title) title.textContent = mode === "register" ? "Registrar" : "Login";
        if (forgot) forgot.style.display = mode === "login" ? "" : "none";
        if (submit) submit.textContent = mode === "register" ? "Registrar" : "Entrar";
        $("df-auth-form-layer")?.setAttribute("data-mode", mode);
        if (email) email.value = "";
        if (pass) pass.value = "";
        resetPasswordVisibility();
        email?.focus();
    }

    function openGate() {
        return new Promise((resolve) => {
            gateResolver = resolve;
            hideAllAuth();
            showLayer("df-auth-gate-layer", true);
            $("main")?.classList.remove("active");
        });
    }

    async function finishGate(menuApi) {
        const r = gateResolver;
        gateResolver = null;
        showLayer("df-auth-form-layer", false);
        showLayer("df-auth-forgot-layer", false);
        showLayer("df-auth-gate-layer", false);
        if (r) r();
    }

    function showProfilePage(on) {
        const el = $("df-profile-layer");
        if (!el) return;
        el.classList.toggle("active", !!on);
        el.setAttribute("aria-hidden", on ? "false" : "true");
        document.documentElement.classList.toggle("df-profile-open", !!on);
        global.dfSyncMobileBackdrop?.();
        if (on) {
            showProfileScreen("main");
            hideAvatarPicker();
            hideBgPicker();
        }
    }

    function showProfileScreen(which) {
        const map = {
            main: $("df-profile-main"),
            settings: $("df-profile-settings"),
            password: $("df-profile-password"),
            decks: $("df-profile-decks"),
        };
        Object.entries(map).forEach(([key, el]) => {
            if (!el) return;
            const on = key === which;
            el.classList.toggle("active", on);
            el.hidden = !on;
        });
        hideLogoutConfirm(true);
    }

    function hideAvatarPicker() {
        const picker = $("df-profile-avatar-picker");
        if (picker) picker.hidden = true;
    }

    function hideBgPicker() {
        const picker = $("df-profile-bg-picker");
        if (picker) picker.hidden = true;
    }

    function toggleAvatarPicker() {
        hideBgPicker();
        const picker = $("df-profile-avatar-picker");
        if (!picker) return;
        const willOpen = picker.hidden;
        picker.hidden = !willOpen;
        if (willOpen) {
            const p = global.DfAuthClient?.getCachedPlayer?.();
            const heroes = heroList();
            const heroId = p?.avatarHeroId || heroes[0]?.id;
            pendingAvatarId = heroId;
            paintAvatarGrid(heroId);
        }
    }

    function hubBgList() {
        return global.DfHubSplash?.list?.() || [];
    }

    function currentHubBgId() {
        return global.DfHubSplash?.readSavedId?.() || global.DfHubSplash?.DEFAULT_ID || "reino-encantado";
    }

    function toggleBgPicker() {
        hideAvatarPicker();
        const picker = $("df-profile-bg-picker");
        if (!picker) return;
        const willOpen = picker.hidden;
        picker.hidden = !willOpen;
        if (willOpen) {
            pendingBgId = currentHubBgId();
            paintBgGrid(pendingBgId);
            global.DfHubSplash?.prefetchVideosForPicker?.();
        }
    }

    function paintBgGrid(selectedId) {
        const grid = $("df-profile-bg-grid");
        if (!grid) return;
        grid.innerHTML = "";
        hubBgList().forEach((bg) => {
            const btn = doc.createElement("button");
            btn.type = "button";
            btn.className = "df-profile-bg-opt" + (bg.id === selectedId ? " selected" : "");
            btn.setAttribute("data-bg-id", bg.id);
            btn.setAttribute("aria-label", bg.name);

            const thumbWrap = doc.createElement("span");
            thumbWrap.className = "df-profile-bg-thumb-wrap";
            const img = doc.createElement("img");
            img.alt = "";
            img.decoding = "async";
            img.loading = "eager";
            img.src = global.DfHubSplash?.thumbUrl?.(bg)
                || global.DfHubSplash?.imageUrl?.(bg)
                || global.DfHubSplash?.bgAsset?.(bg.image || bg.thumb || bg.poster || "REINO ENCANTADO.png")
                || ("bg/" + (bg.image || bg.thumb || bg.poster || "REINO ENCANTADO.png"));
            thumbWrap.appendChild(img);
            btn.appendChild(thumbWrap);

            const label = doc.createElement("span");
            label.className = "df-profile-bg-name";
            label.textContent = bg.name;
            btn.appendChild(label);

            btn.addEventListener("click", () => {
                pendingBgId = bg.id;
                paintBgGrid(bg.id);
            });
            grid.appendChild(btn);
        });
    }

    async function saveHubBackground(bgId) {
        if (!bgId || !global.DfHubSplash?.isValidId?.(bgId)) return;
        if (currentHubBgId() === bgId) {
            hideBgPicker();
            return;
        }
        void global.DfHubSplash?.prefetchVideo?.(bgId);
        global.DfHubSplash?.set?.(bgId);
        global.dfPlayHubVideo?.();
        paintBgGrid(bgId);
        global.DfAuthClient?.patchCachedPlayerFields?.({ hubBackgroundId: bgId });
        try {
            const updated = await global.DfAuthClient.saveHubToServer?.(bgId);
            if (!updated?.hubBackgroundId) {
                global.DfHubSplash?.set?.(bgId);
            }
            refreshProfileMainUI(global.DfAuthClient?.getCachedPlayer?.());
            syncHubProfile();
        } catch (err) {
            if (err?.code === "NETWORK_ERROR") {
                // Já está no aparelho + outbox — mantém o fundo escolhido.
                refreshProfileMainUI(global.DfAuthClient?.getCachedPlayer?.());
                syncHubProfile();
                hideBgPicker();
                await toast("Cenário salvo neste aparelho — sincroniza quando a rede voltar.", 2200);
                return;
            }
            const msg = "Não foi possível salvar o fundo na sua conta. Tente de novo.";
            await toast(msg, 2400);
            global.DfHubSplash?.applySaved?.({ force: true });
            paintBgGrid(currentHubBgId());
            return;
        }
        hideBgPicker();
        await toast("Cenário de fundo alterado!", 1400);
    }

    function heroImageUrl(path) {
        if (!path) return "";
        return global.dfAssetUrl ? global.dfAssetUrl(path) : path;
    }

    function setProfileAvatarSrc(img, hero) {
        if (!img) return;
        const src = hero?.image
            ? heroImageUrl(hero.image)
            : profileAssetUrl("florabellaPortrait");
        img.alt = hero?.name || "Avatar";
        img.style.opacity = "1";
        img.style.visibility = "visible";
        // Força recarregar mesmo se a URL for a mesma (evita frame preto residual).
        if (img.src && img.getAttribute("src") === src) {
            img.removeAttribute("src");
        }
        img.src = src;
        img.onerror = () => {
            if (img.dataset.dfAvatarRetry === "1") {
                img.src = profileAssetUrl("florabellaPortrait");
                return;
            }
            img.dataset.dfAvatarRetry = "1";
            img.src = src;
        };
        img.decode?.().catch?.(() => {});
    }

    function paintAvatarGrid(selectedId) {
        const grid = $("df-profile-avatar-grid");
        if (!grid) return;
        grid.innerHTML = "";
        heroList().forEach((h) => {
            const btn = doc.createElement("button");
            btn.type = "button";
            btn.className = "df-profile-avatar-opt" + (h.id === selectedId ? " selected" : "");
            btn.setAttribute("data-hero-id", h.id);
            btn.setAttribute("aria-label", h.name);
            const img = doc.createElement("img");
            img.alt = "";
            img.width = 96;
            img.height = 96;
            img.decoding = "async";
            img.loading = "eager";
            img.src = heroImageUrl(h.image);
            img.onerror = () => {
                if (img.dataset.dfRetried === "1") return;
                img.dataset.dfRetried = "1";
                img.src = heroImageUrl(h.image);
            };
            btn.appendChild(img);
            btn.addEventListener("click", () => {
                pendingAvatarId = h.id;
                paintAvatarGrid(h.id);
            });
            grid.appendChild(btn);
        });
    }

    async function confirmAvatarPicker() {
        const id = pendingAvatarId;
        if (!id) {
            hideAvatarPicker();
            return;
        }
        await saveAvatar(id);
    }

    async function confirmBgPicker() {
        const id = pendingBgId;
        if (!id) {
            hideBgPicker();
            return;
        }
        await saveHubBackground(id);
    }

    function updatePencilState(editing) {
        const p = global.DfAuthClient?.getCachedPlayer?.();
        const btn = $("btn-profile-name-edit");
        if (!btn) return;
        const locked = !!p?.displayNameLocked;
        btn.classList.toggle("locked", locked || !!editing);
        btn.setAttribute("aria-label", locked
            ? "Nome permanente"
            : editing
                ? "Editando nome"
                : "Editar nome");
    }

    function refreshXpUI(p) {
        p = p || global.DfAuthClient?.getCachedPlayer?.();
        const stats = xpStatsFor(p);
        const pct = stats.xpToNext > 0
            ? Math.min(100, (stats.xpInLevel / stats.xpToNext) * 100)
            : 0;
        const levelEl = $("df-profile-level");
        const textEl = $("df-profile-xp-text");
        const fillEl = $("df-profile-xp-fill");
        if (levelEl) levelEl.textContent = "Nível " + stats.level;
        if (textEl) textEl.textContent = stats.xpInLevel + "/" + stats.xpToNext + " XP";
        if (fillEl) fillEl.style.width = pct + "%";
    }

    function refreshProfileMainUI(p) {
        p = p || global.DfAuthClient?.getCachedPlayer?.();
        const heroes = heroList();
        const heroId = p?.avatarHeroId || heroes[0]?.id;
        const hero = heroes.find((h) => h.id === heroId);
        const img = $("df-profile-avatar-img");
        if (img) {
            img.dataset.dfAvatarRetry = "";
            setProfileAvatarSrc(img, hero);
        }
        const display = $("df-profile-name-display");
        const nameIn = $("df-profile-name-input");
        const label = displayNameFor(p);
        if (display) {
            display.textContent = label;
            display.hidden = false;
        }
        if (nameIn) {
            nameIn.value = p?.displayName || "";
            nameIn.hidden = true;
        }
        updatePencilState();
        refreshXpUI(p);
        refreshPlaceholders();
    }

    async function saveAvatar(heroId) {
        if (!heroId) return;
        const p = global.DfAuthClient?.getCachedPlayer?.();
        // Optimistic: mostra o herói na moldura na hora (evita quadrado preto).
        const hero = heroList().find((h) => h.id === heroId);
        setProfileAvatarSrc($("df-profile-avatar-img"), hero);
        if (p?.avatarHeroId === heroId) {
            hideAvatarPicker();
            return;
        }
        try {
            global.DfAuthClient?.patchCachedPlayerFields?.({ avatarHeroId: heroId });
            const saveAvatar = global.DfAuthClient.saveAvatarToServer
                || ((id) => global.DfAuthClient.updateProfile({ avatarHeroId: id }, { force: true }));
            await saveAvatar(heroId);
            refreshProfileMainUI(global.DfAuthClient.getCachedPlayer());
            syncHubProfile();
            hideAvatarPicker();
            await toast("Avatar atualizado!", 1200);
        } catch (err) {
            await toast("Não foi possível atualizar o avatar.", 1600);
            refreshProfileMainUI(global.DfAuthClient?.getCachedPlayer?.());
        }
    }

    async function commitNameEdit() {
        const nameIn = $("df-profile-name-input");
        const display = $("df-profile-name-display");
        if (!nameIn || !display) return;
        const name = nameIn.value.trim().slice(0, 10);
        nameIn.value = name;
        nameIn.hidden = true;
        display.hidden = false;
        const p = global.DfAuthClient?.getCachedPlayer?.();
        if (!name || p?.displayNameLocked) return;
        if (name.length < 3) {
            await toast("Nome inválido (3–10 caracteres).", 1800);
            refreshProfileMainUI(p);
            return;
        }
        if (p?.displayName === name) return;
        try {
            // Optimistic: nome fica visível mesmo se a rede falhar (outbox).
            global.DfAuthClient?.patchCachedPlayerFields?.({ displayName: name });
            if (display) display.textContent = name;
            global.DfAuthClient?.markLocalProfileDirty?.();
            syncHubProfile();
            await global.DfAuthClient.updateProfile({ displayName: name });
            refreshProfileMainUI(global.DfAuthClient.getCachedPlayer());
            syncHubProfile();
        } catch (err) {
            if (err?.code === "NETWORK_ERROR") {
                refreshProfileMainUI(global.DfAuthClient?.getCachedPlayer?.());
                syncHubProfile();
                return;
            }
            const msg = err?.code === "NAME_TAKEN" ? "Nome já em uso."
                : err?.code === "NAME_LOCKED" ? "Nome já foi definido."
                : err?.code === "BAD_NAME" ? "Nome inválido (3–10 caracteres)."
                : "Não foi possível salvar o nome.";
            await toast(msg, 1800);
            refreshProfileMainUI(global.DfAuthClient?.getCachedPlayer?.());
            syncHubProfile();
        }
    }

    function startNameEdit() {
        const p = global.DfAuthClient?.getCachedPlayer?.();
        if (p?.displayNameLocked) return;
        const nameIn = $("df-profile-name-input");
        const display = $("df-profile-name-display");
        if (!nameIn || !display) return;
        nameIn.value = p?.displayName || "";
        display.hidden = true;
        nameIn.hidden = false;
        updatePencilState(true);
        nameIn.focus();
        nameIn.select();
    }

    async function openProfile() {
        $("play-menu")?.classList.remove("active");
        showProfilePage(true);
        $("df-hub-splash-layer")?.setAttribute("aria-hidden", "true");
        clearProfilePasswordFields();
        hideAvatarPicker();
        hideBgPicker();
        // UI imediata com cache — sem esperar rede/vídeo.
        refreshProfileMainUI(global.DfAuthClient?.getCachedPlayer?.());
        try { global.DfProfileAssets?.prefetchAvatarFallback?.(); } catch (e) { /* */ }
        // Fundo/vídeo em paralelo, sem bloquear botões do perfil.
        void Promise.resolve().then(() => {
            try {
                global.dfEnsureHubVideo?.() || global.DfHubSplash?.ensureCurrent?.();
                global.DfHubSplash?.applySaved?.({ force: true });
                global.dfPlayHubVideo?.();
            } catch (e) { /* */ }
        });
        void global.DfAuthClient?.liveSyncNow?.(true)?.then?.(() => {
            refreshProfileMainUI(global.DfAuthClient?.getCachedPlayer?.());
        }).catch?.(() => {});
    }

    function closeProfile() {
        showProfilePage(false);
        $("play-menu")?.classList.add("active");
        $("df-hub-splash-layer")?.setAttribute("aria-hidden", "false");
        global.dfSyncMobileBackdrop?.();
        global.dfPlayHubVideo?.();
        syncHubProfile();
    }

    function bind(menuApi) {
        menuApiRef = menuApi;
        $("btn-auth-login")?.addEventListener("click", () => openForm("login"));
        $("btn-auth-register")?.addEventListener("click", () => openForm("register"));
        $("btn-auth-back")?.addEventListener("click", () => {
            showLayer("df-auth-form-layer", false);
            showLayer("df-auth-gate-layer", true);
        });

        $("btn-auth-password-toggle")?.addEventListener("click", () => {
            const pass = $("df-auth-password");
            const btn = $("btn-auth-password-toggle");
            if (!pass || !btn) return;
            const show = pass.type === "password";
            pass.type = show ? "text" : "password";
            btn.classList.toggle("visible", show);
            btn.setAttribute("aria-pressed", show ? "true" : "false");
            btn.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
        });

        $("df-auth-forgot")?.addEventListener("click", (e) => {
            e.preventDefault();
            openForgotForm();
        });

        $("btn-forgot-back")?.addEventListener("click", () => closeForgotForm());

        $("btn-forgot-submit")?.addEventListener("click", async () => {
            const email = $("df-forgot-email")?.value?.trim();
            if (!email) {
                await toast("Digite seu e-mail.", 1500);
                $("df-forgot-email")?.focus();
                return;
            }
            const btn = $("btn-forgot-submit");
            if (btn) btn.disabled = true;
            try {
                const result = await global.DfAuthClient?.forgotPassword?.(email);
                if (result?.sent) {
                    await banner(
                        "Enviamos a mesma senha que você cadastrou para " + email + ". Verifique entrada e spam.",
                        5500,
                    );
                    closeForgotForm();
                } else {
                    await banner(
                        "Se este e-mail estiver cadastrado no Dragonfall, você receberá sua senha em instantes.",
                        4500,
                    );
                }
            } catch (err) {
                const msg = authErrorMessage(err, "Não foi possível processar. Tente de novo.");
                await banner(msg, 4500);
            } finally {
                if (btn) btn.disabled = false;
            }
        });

        $("df-auth-submit")?.addEventListener("click", async () => {
            const mode = $("df-auth-form-layer")?.getAttribute("data-mode") || "login";
            const email = $("df-auth-email")?.value?.trim();
            const password = ($("df-auth-password")?.value || "").trim();
            if (!email || !password) {
                await toast("Preencha e-mail e senha.", 1500);
                return;
            }
            const btn = $("df-auth-submit");
            if (btn) btn.disabled = true;
            try {
                const auth = global.DfAuthClient;
                if (!auth || typeof auth.login !== "function") {
                    throw Object.assign(new Error("AUTH_CLIENT_MISSING"), { code: "AUTH_CLIENT_MISSING" });
                }
                void toast(mode === "register" ? "Criando conta…" : "Entrando…", 900);
                let player;
                if (mode === "register") {
                    player = await auth.register(email, password);
                    await toast("Perfil registrado", 900);
                } else {
                    player = await auth.login(email, password);
                }
                try { doc.activeElement?.blur?.(); } catch (e) { /* */ }
                try { global.dfLockSoftKeyboardLayout?.(false); } catch (e) { /* */ }
                showLayer("df-auth-form-layer", false);
                await finishGate(menuApiRef);
                try { global.DfLayout?.syncDesktopLayoutViewport?.() || global.DfLayout?.syncLayoutViewport?.(); } catch (e) { /* */ }
                try { global.DfAuthUi?.syncHubProfile?.(); } catch (e) { /* */ }
            } catch (err) {
                const msg = authErrorMessage(err, "Não foi possível continuar. Tente de novo.");
                await toast(msg, 2800);
            } finally {
                if (btn) btn.disabled = false;
            }
        });

        bindPasswordToggle("btn-profile-current-pw-toggle", "df-profile-current-password");
        bindPasswordToggle("btn-profile-new-pw-toggle", "df-profile-new-password");

        $("btn-profile-change-password")?.addEventListener("click", async () => {
            const current = $("df-profile-current-password")?.value || "";
            const next = $("df-profile-new-password")?.value || "";
            if (!current || !next) {
                await toast("Preencha senha atual e nova senha.", 1800);
                return;
            }
            if (next.length < 6) {
                await toast("Nova senha muito curta (mín. 6).", 1800);
                return;
            }
            const btn = $("btn-profile-change-password");
            if (btn) btn.disabled = true;
            try {
                await global.DfAuthClient.changePassword(current, next);
                clearProfilePasswordFields();
                showProfileScreen("main");
                await toast("Senha alterada! Enviamos a nova senha para seu e-mail.", 2500);
            } catch (err) {
                const msg = err?.code === "INVALID_CREDENTIALS" ? "Senha atual incorreta."
                    : err?.code === "PASSWORD_UNCHANGED" ? "A nova senha deve ser diferente da atual."
                    : err?.code === "PASSWORD_TOO_SHORT" ? "Nova senha muito curta (mín. 6)."
                    : err?.code === "MAIL_NOT_CONFIGURED" ? "E-mail não configurado no servidor."
                    : err?.code === "MAIL_FAILED" ? "Senha alterada no jogo, mas falhou enviar e-mail."
                    : "Não foi possível trocar a senha.";
                await toast(msg, 2200);
            } finally {
                if (btn) btn.disabled = false;
            }
        });

        $("btn-hub-profile")?.addEventListener("click", () => openProfile());
        $("btn-profile-close")?.addEventListener("click", () => closeProfile());
        $("btn-settings-close")?.addEventListener("click", () => showProfileScreen("main"));
        $("btn-password-close")?.addEventListener("click", () => {
            clearProfilePasswordFields();
            showProfileScreen("main");
        });
        $("btn-decks-close")?.addEventListener("click", () => closeProfile());
        $("btn-profile-settings")?.addEventListener("click", () => showProfileScreen("settings"));
        $("btn-settings-password")?.addEventListener("click", () => {
            clearProfilePasswordFields();
            showProfileScreen("password");
        });
        $("btn-profile-avatar-main")?.addEventListener("click", () => toggleAvatarPicker());
        $("btn-profile-swap-avatar")?.addEventListener("click", () => toggleAvatarPicker());
        $("btn-profile-cycle-frame")?.addEventListener("click", () => {
            cycleFrameStyle();
        });
        $("btn-profile-privacy")?.addEventListener("click", () => toggleStatsPrivacy());
        $("btn-profile-journey")?.addEventListener("click", (e) => {
            e.preventDefault();
        });
        $("btn-profile-picker-close")?.addEventListener("click", () => { void confirmAvatarPicker(); });
        $("btn-profile-bg-picker-close")?.addEventListener("click", () => { void confirmBgPicker(); });
        $("btn-profile-name-edit")?.addEventListener("click", () => startNameEdit());
        $("btn-profile-edit-deck")?.addEventListener("click", () => {
            closeProfile();
            try { global.DfMobileImmersive?.enterFullscreenFromGesture?.(); } catch (err) { /* */ }
            if (global.DfArsenal?.open) {
                void global.DfArsenal.open({ filter: "champion" });
            } else {
                showProfileScreen("decks");
            }
        });
        $("btn-decks-back")?.addEventListener("click", () => showProfileScreen("main"));
        $("btn-decks-return")?.addEventListener("click", () => showProfileScreen("main"));
        $("btn-profile-change-bg")?.addEventListener("click", () => toggleBgPicker());
        $("df-profile-name-input")?.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                commitNameEdit();
            }
            if (e.key === "Escape") {
                refreshProfileMainUI();
            }
        });
        $("df-profile-name-input")?.addEventListener("blur", () => commitNameEdit());
        $("btn-settings-logout")?.addEventListener("click", () => {
            const confirm = $("df-profile-logout-confirm");
            if (confirm) confirm.hidden = false;
            else void doLogout();
        });
        $("btn-profile-logout-yes")?.addEventListener("click", () => {
            hideLogoutConfirm(true);
            void doLogout();
        });
        $("btn-profile-logout-no")?.addEventListener("click", () => {
            hideLogoutConfirm(true);
        });
    }

    function hideLogoutConfirm(hide) {
        const confirm = $("df-profile-logout-confirm");
        if (!confirm) return;
        confirm.hidden = hide !== false;
    }

    async function doLogout() {
        hideLogoutConfirm(true);
        void toast("Desconectando…", 800);
        // Logout local é síncrono/rápido — não bloquear a UI na rede.
        try {
            await Promise.race([
                Promise.resolve(global.DfAuthClient?.logout?.()),
                new Promise((r) => global.setTimeout(r, 1500)),
            ]);
        } catch (e) { /* */ }
        showProfilePage(false);
        $("play-menu")?.classList.remove("active");
        const hub = $("df-hub-splash-layer");
        if (hub) hub.setAttribute("aria-hidden", "true");
        $("main")?.classList.add("active");
        try { global.DfAuthUi?.syncHubProfile?.(); } catch (e) { /* */ }
        void toast("Desconectado.", 1200);
    }

    function boot(menuApi) {
        bind(menuApi);
        global.DfHubSplash?.applySaved?.();
        syncHubProfile();
    }

    global.DfAuthUi = Object.freeze({
        openGate,
        bootToHub,
        boot,
        hideAllAuth,
        syncHubProfile,
        openProfile,
        refreshProfileMainUI,
        refreshXpUI,
        displayNameFor,
        accountLabelFor,
        enteringAsMessage,
        announceEnteringAs,
        toast,
    });
})(typeof window !== "undefined" ? window : globalThis);
