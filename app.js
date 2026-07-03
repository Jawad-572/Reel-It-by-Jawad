// ============================================
// REEL IT — app.js
// Talks only to our own Netlify functions.
// The fal.ai key never touches the browser.
// ============================================

const els = {
  photoInput: document.getElementById("productPhoto"),
  uploader: document.getElementById("uploaderText"),
  uploaderLabel: document.querySelector(".uploader"),
  direction: document.getElementById("directionInput"),
  sceneChips: document.getElementById("sceneChips"),
  lengthChips: document.getElementById("lengthChips"),
  rollBtn: document.getElementById("rollBtn"),
  creditsLeft: document.getElementById("creditsLeft"),
  slateClap: document.getElementById("slateClap"),
  rollingState: document.getElementById("rollingState"),
  rollingSub: document.getElementById("rollingSub"),
  resultState: document.getElementById("resultState"),
  resultVideo: document.getElementById("resultVideo"),
  downloadBtn: document.getElementById("downloadBtn"),
  anotherTakeBtn: document.getElementById("anotherTakeBtn"),
  errorState: document.getElementById("errorState"),
  errorBody: document.getElementById("errorBody"),
  errorRetryBtn: document.getElementById("errorRetryBtn"),
};

let state = {
  imageDataUrl: null,
  scene: "studio",
  length: "5",
};

// Credits are shown and refreshed by auth.js (window.ReelAuth),
// since they live server-side in Supabase now, not localStorage.

// ---------- image upload + preview ----------
els.photoInput.addEventListener("change", () => {
  const file = els.photoInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    state.imageDataUrl = reader.result;
    els.uploader.textContent = file.name;
    els.uploaderLabel.classList.add("has-image");
    els.uploaderLabel.style.backgroundImage = `linear-gradient(rgba(18,19,26,0.55), rgba(18,19,26,0.55)), url(${reader.result})`;
  };
  reader.readAsDataURL(file);
});

// ---------- scene / length chip selection ----------
function wireChipGroup(container, stateKey, dataAttr) {
  container.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    [...container.children].forEach((c) => c.classList.remove("is-active"));
    btn.classList.add("is-active");
    state[stateKey] = btn.dataset[dataAttr];
  });
}
wireChipGroup(els.sceneChips, "scene", "scene");
wireChipGroup(els.lengthChips, "length", "length");

// ---------- view switching ----------
function showView(name) {
  els.rollingState.hidden = name !== "rolling";
  els.resultState.hidden = name !== "result";
  els.errorState.hidden = name !== "error";
  document.getElementById("slate").hidden = name === "rolling" || name === "result" || name === "error" ? false : false;
  // slate stays visible always except we lock it while rolling
  els.rollBtn.hidden = name === "rolling" || name === "result" || name === "error";
}

// ---------- clapperboard snap animation on submit ----------
function snapClap() {
  els.slateClap.style.transform = "rotate(-6deg)";
  setTimeout(() => { els.slateClap.style.transform = "rotate(0deg)"; }, 180);
}

// ---------- submit + poll ----------
async function generateVideo() {
  if (!state.imageDataUrl) {
    alert("Add a product photo first — the slate needs a shot to work with.");
    return;
  }

  snapClap();
  showView("rolling");
  els.rollingSub.textContent = "Sending your shot to the studio";

  try {
    const token = await window.ReelAuth.getAccessToken();
    if (!token) throw new Error("You've been signed out — sign in again to keep rolling.");

    // Step 1: submit the job. Our function forwards to fal.ai and
    // returns a request id we can poll (fal.ai jobs are async).
    const submitRes = await fetch("/.netlify/functions/generate-video", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        image: state.imageDataUrl,
        direction: els.direction.value.trim(),
        scene: state.scene,
        lengthSeconds: state.length,
      }),
    });

    if (!submitRes.ok) {
      const err = await safeJson(submitRes);
      throw new Error(err?.message || "The studio couldn't start the shoot.");
    }
    const { requestId } = await submitRes.json();

    // Step 2: poll for the finished video.
    const videoUrl = await pollForResult(requestId);

    // success
    window.ReelAuth.refreshCredits();
    els.resultVideo.src = videoUrl;
    els.downloadBtn.href = videoUrl;
    showView("result");

  } catch (err) {
    console.error(err);
    els.errorBody.textContent = err.message || "Something went wrong on set. Try again.";
    showView("error");
  }
}

async function pollForResult(requestId) {
  const messages = [
    "Setting up the shot",
    "Rolling film",
    "Grading the take",
    "Almost ready to screen",
  ];
  const maxAttempts = 40; // ~2 minutes at 3s intervals
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    els.rollingSub.textContent = messages[Math.min(attempt, messages.length - 1)];
    const res = await fetch(`/.netlify/functions/check-status?id=${encodeURIComponent(requestId)}`);
    if (!res.ok) throw new Error("Lost connection to the studio.");
    const data = await res.json();

    if (data.status === "completed" && data.videoUrl) {
      return data.videoUrl;
    }
    if (data.status === "failed") {
      throw new Error(data.message || "The take didn't come out. Try a different photo or direction.");
    }
    await sleep(3000);
  }
  throw new Error("This take is running long. Check back in a minute.");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function safeJson(res) { try { return await res.json(); } catch { return null; } }

// ---------- buttons ----------
els.rollBtn.addEventListener("click", generateVideo);
els.anotherTakeBtn.addEventListener("click", () => showView("slate"));
els.errorRetryBtn.addEventListener("click", () => showView("slate"));

// ---------- PWA service worker (mirrors your Img2Pdf setup) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
