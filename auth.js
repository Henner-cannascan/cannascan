/*
 * Login- und Registrierungslogik fuer die eigenstaendige /login-Seite.
 *
 * Die Seite spricht nur mit /api/auth/*. Nach erfolgreichem Login setzt der
 * Server ein HttpOnly-Session-Cookie; JavaScript bekommt nur die Userdaten fuer
 * die Weiterleitung und Statusanzeige.
 */
const nextPath = document.body?.dataset.next || "/dashboard";
const authMessage = document.querySelector("#authMessage");
const loginForm = document.querySelector("#loginForm");
const registerForm = document.querySelector("#registerForm");
const tabButtons = document.querySelectorAll("[data-auth-tab]");
const forms = document.querySelectorAll("[data-auth-form]");

function setAuthMessage(message, tone = "neutral") {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.dataset.tone = tone;
}

function switchAuthTab(target) {
  tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.authTab === target));
  forms.forEach((form) => form.classList.toggle("active", form.dataset.authForm === target));
  const firstInput = document.querySelector(`[data-auth-form="${target}"] input`);
  firstInput?.focus();
  setAuthMessage("");
}

function deviceName() {
  const platform = navigator.platform || "Browser";
  const language = navigator.language || "";
  return [platform, language].filter(Boolean).join(" · ").slice(0, 120);
}

async function postAuth(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { error: text };
  }
  if (!response.ok) {
    throw new Error(body.error || `Serverfehler ${response.status}`);
  }
  return body;
}

function formValue(form, name) {
  return String(new FormData(form).get(name) || "").trim();
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  setAuthMessage("Anmeldung läuft...");

  try {
    await postAuth("/api/auth/login", {
      username: formValue(form, "username"),
      password: String(new FormData(form).get("password") || ""),
      rememberDevice: Boolean(new FormData(form).get("rememberDevice")),
      deviceName: deviceName(),
    });
    window.location.href = nextPath;
  } catch (error) {
    setAuthMessage(error.message || "Anmeldung fehlgeschlagen.", "error");
  } finally {
    button.disabled = false;
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const password = String(data.get("password") || "");
  const passwordConfirm = String(data.get("passwordConfirm") || "");

  if (password !== passwordConfirm) {
    setAuthMessage("Die Passwörter stimmen nicht überein.", "error");
    return;
  }

  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  setAuthMessage("Konto wird erstellt...");

  try {
    await postAuth("/api/auth/register", {
      username: formValue(form, "username"),
      email: formValue(form, "email"),
      password,
      rememberDevice: Boolean(data.get("rememberDevice")),
      deviceName: deviceName(),
    });
    window.location.href = nextPath;
  } catch (error) {
    setAuthMessage(error.message || "Konto konnte nicht erstellt werden.", "error");
  } finally {
    button.disabled = false;
  }
}

tabButtons.forEach((button) => {
  button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
});
loginForm?.addEventListener("submit", handleLoginSubmit);
registerForm?.addEventListener("submit", handleRegisterSubmit);
loginForm?.querySelector("input")?.focus();
