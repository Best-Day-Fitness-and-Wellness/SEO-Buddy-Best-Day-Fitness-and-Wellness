'use strict';

(function exposeRecordedContent(global) {
  let initialized = false;

  global.initializeRecordedContent = function initializeRecordedContent() {
    if (initialized) return;
    initialized = true;

    const { authFetch } = global.SeoBuddyCore;
    const recDrop = document.getElementById('rec-drop');
    const recFile = document.getElementById('rec-file');
    const recStatus = document.getElementById('rec-status');
    if (recDrop) recDrop.removeAttribute('aria-busy');

    function recSay(message, className) {
      if (!recStatus) return;
      recStatus.className = `rec-status${className ? ` ${className}` : ''}`;
      recStatus.textContent = message || '';
    }

    let recognition = null;
    let dictating = false;
    let dictationRestarts = 0;

    function appendTranscript(text) {
      const textarea = document.getElementById('input-transcript');
      if (!textarea || !text) return;
      const needsSpace = textarea.value && !/\s$/.test(textarea.value);
      textarea.value = textarea.value + (needsSpace ? ' ' : '') + text;
      textarea.scrollTop = textarea.scrollHeight;
    }

    function setDictationLive(on) {
      const button = document.getElementById('btn-dictate');
      const label = document.getElementById('rec-dictate-label');
      if (!button) return;
      button.classList.toggle('live', on);
      if (label) label.textContent = on ? 'Stop dictating' : 'Dictate straight into the box';
    }

    function stopDictation(message, className) {
      dictating = false;
      dictationRestarts = 0;
      try {
        if (recognition) {
          recognition.onend = null;
          recognition.stop();
        }
      } catch (error) { /* already stopped */ }
      recognition = null;
      setDictationLive(false);
      recSay(message || '', className || '');
    }

    async function transcribeFile(file) {
      if (!file) return;
      if (dictating) stopDictation();
      const maxBytes = 18 * 1048576;
      if (file.size > maxBytes) {
        recSay(`That file is ${(file.size / 1048576).toFixed(1)}MB — the limit is 18MB. Record audio only instead of video, or trim it.`, 'err');
        return;
      }
      recSay(`Transcribing ${file.name} (${(file.size / 1048576).toFixed(1)}MB)… this takes about as long as the recording.`);
      try {
        const encoded = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('Could not read that file.'));
          reader.readAsDataURL(file);
        });
        const response = await authFetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: encoded, mimeType: file.type }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Transcription failed.');
        const textarea = document.getElementById('input-transcript');
        if (textarea) {
          if (textarea.value.trim()) appendTranscript(result.transcript);
          else textarea.value = result.transcript;
        }
        recSay(`Transcribed — ${result.words} words added. Edit it if you like, then generate the article.`, 'ok');
      } catch (error) {
        recSay(error.message, 'err');
      }
    }

    const SpeechRecognition = global.SpeechRecognition || global.webkitSpeechRecognition;
    const dictationWrap = document.getElementById('rec-dictate-wrap');
    const dictationButton = document.getElementById('btn-dictate');
    if (SpeechRecognition && dictationWrap) dictationWrap.style.display = '';

    function startDictation() {
      if (!SpeechRecognition) return;
      recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = document.documentElement.lang || 'en-US';
      recognition.onstart = () => {
        dictationRestarts = 0;
        recSay('Listening — just talk. Your words land in the box below.', 'live');
      };
      recognition.onresult = event => {
        let interim = '';
        let settled = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const text = event.results[index][0].transcript;
          if (event.results[index].isFinal) settled += text;
          else interim += text;
        }
        if (settled.trim()) appendTranscript(settled.trim());
        recSay(interim.trim() ? `… ${interim.trim()}` : 'Listening — just talk. Your words land in the box below.', 'live');
      };
      recognition.onerror = event => {
        if (event.error === 'no-speech' || event.error === 'aborted') return;
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopDictation('Microphone access is blocked. Allow it for this site in your browser settings, then try again — or upload a recording instead.', 'err');
          return;
        }
        if (event.error === 'audio-capture') {
          stopDictation('No microphone found. Plug one in, or upload a recording instead.', 'err');
          return;
        }
        if (event.error === 'network') {
          stopDictation('Speech recognition lost its connection. Try again, or upload a recording instead.', 'err');
          return;
        }
        stopDictation(`Dictation stopped: ${event.error}`, 'err');
      };
      recognition.onend = () => {
        if (!dictating) return;
        if (dictationRestarts++ > 40) {
          stopDictation('Dictation kept dropping out — try again, or upload a recording instead.', 'err');
          return;
        }
        try { recognition.start(); } catch (error) { /* already starting */ }
      };
      try {
        recognition.start();
        dictating = true;
        setDictationLive(true);
      } catch (error) {
        stopDictation(`Could not start dictation: ${error.message}`, 'err');
      }
    }

    if (dictationButton) {
      dictationButton.addEventListener('click', () => {
        if (dictating) {
          const textarea = document.getElementById('input-transcript');
          const words = textarea && textarea.value.trim() ? textarea.value.trim().split(/\s+/).length : 0;
          stopDictation(words ? `Stopped — ${words} words. Edit it if you like, then generate the article.` : 'Stopped.', words ? 'ok' : '');
        } else {
          startDictation();
        }
      });
    }
    global.addEventListener('beforeunload', () => { if (dictating) stopDictation(); });

    if (recDrop && recFile) {
      recDrop.addEventListener('click', () => recFile.click());
      recFile.addEventListener('change', () => transcribeFile(recFile.files[0]));
      ['dragenter', 'dragover'].forEach(eventName => recDrop.addEventListener(eventName, event => {
        event.preventDefault();
        recDrop.classList.add('over');
      }));
      ['dragleave', 'drop'].forEach(eventName => recDrop.addEventListener(eventName, event => {
        event.preventDefault();
        recDrop.classList.remove('over');
      }));
      recDrop.addEventListener('drop', event => {
        if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0]) {
          transcribeFile(event.dataTransfer.files[0]);
        }
      });
    }

    const socialButton = document.getElementById('btn-social-pack');
    const socialOutput = document.getElementById('sp-out');
    if (socialButton) socialButton.disabled = false;
    let socialState = { transcript: '', ideaIndex: 1, hookIndex: 1 };
    const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));

    function renderSocialPack(pack) {
      const ideas = (pack.ideas || []).map((text, index) =>
        `<div class="sp-item${index + 1 === pack.ideaIndex ? ' sel' : ''}" data-sp-idea="${index + 1}">${escape(text)}</div>`).join('');
      const hooks = (pack.hooks || []).map((text, index) =>
        `<div class="sp-item${index + 1 === pack.hookIndex ? ' sel' : ''}" data-sp-hook="${index + 1}">${escape(text)}</div>`).join('');
      const platforms = (pack.platforms || []).map(text => `<span class="sp-plat" data-sp-plat>${escape(text)}</span>`).join('');
      socialOutput.innerHTML =
        `<div class="sp-sec"><h4>Five angles <span class="text-muted" style="font-weight:400;">— tap one to rebuild around it</span></h4>${ideas}</div>` +
        `<div class="sp-sec"><h4>Five hooks <span class="text-muted" style="font-weight:400;">— tap one to rewrite the script</span></h4>${hooks}</div>` +
        `<div class="sp-sec"><h4>30-second script</h4><div class="sp-script">${escape(pack.script)}</div>` +
        `<div class="sp-plats">${platforms}</div>` +
        '<p class="text-muted" style="font-size:var(--font-xs);margin-top:10px;">Record it once, post the same video to each — tap a platform to tick it off.</p></div>';
    }

    async function buildSocialPack(ideaIndex, hookIndex) {
      const textarea = document.getElementById('sp-transcript');
      const transcript = textarea ? textarea.value.trim() : '';
      if (transcript.length < 200) {
        socialOutput.innerHTML = '<div class="sp-err">Need a transcript of at least a couple of paragraphs.</div>';
        return;
      }
      socialState = { transcript, ideaIndex: ideaIndex || 1, hookIndex: hookIndex || 1 };
      socialButton.disabled = true;
      socialOutput.innerHTML = '<p class="text-muted" style="margin-top:14px;">Working through ideas, hooks and a script…</p>';
      try {
        const response = await authFetch('/api/social-pack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(socialState),
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Could not build the pack.');
        renderSocialPack(result);
      } catch (error) {
        socialOutput.innerHTML = `<div class="sp-err">${escape(error.message)}</div>`;
      } finally {
        socialButton.disabled = false;
      }
    }

    if (socialButton) socialButton.addEventListener('click', () => buildSocialPack(1, 1));
    if (socialOutput) {
      socialOutput.addEventListener('click', event => {
        const idea = event.target.closest('[data-sp-idea]');
        if (idea) { buildSocialPack(Number(idea.dataset.spIdea), 1); return; }
        const hook = event.target.closest('[data-sp-hook]');
        if (hook) { buildSocialPack(socialState.ideaIndex, Number(hook.dataset.spHook)); return; }
        const platform = event.target.closest('[data-sp-plat]');
        if (platform) platform.classList.toggle('done');
      });
    }
  };
})(window);
