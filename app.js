(() => {
  'use strict';

  const STORAGE_KEY = 'geminiGithubChat.v1';
  const defaultSettings = {
    apiKey: '',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-flash',
    systemPrompt: '請使用繁體中文回答，內容清楚、精確。',
    temperature: 0.7
  };

  const els = Object.fromEntries([
    'sidebar','sidebarClose','sidebarBackdrop','menuButton','conversationList','newChatButton',
    'settingsButton','topSettingsButton','settingsDialog','settingsForm','apiKeyInput','baseUrlInput',
    'modelInput','systemPromptInput','temperatureInput','temperatureOutput','toggleKeyButton',
    'saveSettingsButton','clearAllButton','exportButton','headerTitle','modelLabel','chatScroll',
    'messages','welcome','promptInput','sendButton','toast'
  ].map(id => [id, document.getElementById(id)]));

  let state = loadState();
  let abortController = null;
  let toastTimer = null;

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.conversations)) {
        return {
          settings: { ...defaultSettings, ...(saved.settings || {}) },
          conversations: saved.conversations,
          activeId: saved.activeId || saved.conversations[0]?.id || null
        };
      }
    } catch (error) {
      console.warn('無法讀取舊資料：', error);
    }
    return { settings: { ...defaultSettings }, conversations: [], activeId: null };
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function currentConversation() {
    return state.conversations.find(item => item.id === state.activeId) || null;
  }

  function createConversation() {
    const conversation = {
      id: uid(),
      title: '新對話',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: []
    };
    state.conversations.unshift(conversation);
    state.activeId = conversation.id;
    persist();
    render();
    closeSidebar();
    els.promptInput.focus();
    return conversation;
  }

  function deleteConversation(id) {
    state.conversations = state.conversations.filter(item => item.id !== id);
    if (state.activeId === id) state.activeId = state.conversations[0]?.id || null;
    persist();
    render();
  }

  function render() {
    renderSidebar();
    renderMessages();
    els.modelLabel.textContent = state.settings.model;
    const active = currentConversation();
    els.headerTitle.textContent = active?.title || '新對話';
  }

  function renderSidebar() {
    els.conversationList.innerHTML = '';
    if (!state.conversations.length) {
      const empty = document.createElement('div');
      empty.className = 'empty-history';
      empty.textContent = '尚無對話紀錄。開始第一段對話後會顯示在這裡。';
      els.conversationList.appendChild(empty);
      return;
    }

    state.conversations
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .forEach(conversation => {
        const button = document.createElement('div');
        button.className = `conversation-item${conversation.id === state.activeId ? ' active' : ''}`;
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        button.dataset.id = conversation.id;

        const title = document.createElement('span');
        title.className = 'conversation-title';
        title.textContent = conversation.title || '未命名對話';

        const del = document.createElement('button');
        del.className = 'delete-chat';
        del.type = 'button';
        del.title = '刪除對話';
        del.textContent = '×';
        del.addEventListener('click', event => {
          event.stopPropagation();
          deleteConversation(conversation.id);
        });

        button.append(title, del);
        const activate = () => {
          state.activeId = conversation.id;
          persist();
          render();
          closeSidebar();
        };
        button.addEventListener('click', activate);
        button.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        });
        els.conversationList.appendChild(button);
      });
  }

  function renderMessages() {
    const conversation = currentConversation();
    els.messages.innerHTML = '';
    const messages = conversation?.messages || [];
    els.welcome.hidden = messages.length > 0;

    messages.forEach((message, index) => {
      els.messages.appendChild(createMessageElement(message, index));
    });
    requestAnimationFrame(scrollToBottom);
  }

  function createMessageElement(message, index) {
    const article = document.createElement('article');
    article.className = `message ${message.role}`;

    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = message.role === 'user' ? '你' : '✦';

    const contentWrap = document.createElement('div');
    const body = document.createElement('div');
    body.className = 'message-body';

    if (message.role === 'assistant') {
      body.innerHTML = renderMarkdown(message.text || '');
      attachCodeCopyButtons(body);
      if (message.streaming) {
        const cursor = document.createElement('span');
        cursor.className = 'typing-cursor';
        body.appendChild(cursor);
      }
    } else {
      body.textContent = message.text;
    }

    const tools = document.createElement('div');
    tools.className = 'message-tools';
    const copy = document.createElement('button');
    copy.className = 'message-tool';
    copy.textContent = '複製';
    copy.addEventListener('click', () => copyText(message.text));
    tools.appendChild(copy);

    if (!message.streaming) {
      const remove = document.createElement('button');
      remove.className = 'message-tool';
      remove.textContent = '刪除此則';
      remove.addEventListener('click', () => {
        const conversation = currentConversation();
        if (!conversation) return;
        conversation.messages.splice(index, 1);
        conversation.updatedAt = Date.now();
        persist();
        render();
      });
      tools.appendChild(remove);
    }

    contentWrap.append(body, tools);
    article.append(avatar, contentWrap);
    return article;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function renderMarkdown(source) {
    const codeBlocks = [];
    let text = String(source || '').replace(/```([^\n]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const token = `@@CODEBLOCK_${codeBlocks.length}@@`;
      codeBlocks.push({ lang: lang.trim() || 'code', code });
      return token;
    });

    text = escapeHtml(text)
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    const lines = text.split('\n');
    const output = [];
    let listType = null;
    const closeList = () => {
      if (listType) output.push(`</${listType}>`);
      listType = null;
    };

    for (const line of lines) {
      const ul = line.match(/^\s*[-*] (.+)$/);
      const ol = line.match(/^\s*\d+\. (.+)$/);
      if (ul) {
        if (listType !== 'ul') { closeList(); output.push('<ul>'); listType = 'ul'; }
        output.push(`<li>${ul[1]}</li>`);
      } else if (ol) {
        if (listType !== 'ol') { closeList(); output.push('<ol>'); listType = 'ol'; }
        output.push(`<li>${ol[1]}</li>`);
      } else {
        closeList();
        if (!line.trim()) output.push('');
        else if (/^<(h1|h2|h3)>/.test(line)) output.push(line);
        else if (/^@@CODEBLOCK_\d+@@$/.test(line)) output.push(line);
        else output.push(`<p>${line}</p>`);
      }
    }
    closeList();

    let html = output.join('\n');
    codeBlocks.forEach((block, i) => {
      html = html.replace(
        `@@CODEBLOCK_${i}@@`,
        `<div class="code-block"><div class="code-header"><span>${escapeHtml(block.lang)}</span><button class="code-copy" type="button">複製</button></div><pre><code>${escapeHtml(block.code)}</code></pre></div>`
      );
    });
    return html;
  }

  function attachCodeCopyButtons(root) {
    root.querySelectorAll('.code-block').forEach(block => {
      const button = block.querySelector('.code-copy');
      const code = block.querySelector('code');
      button?.addEventListener('click', () => copyText(code?.textContent || ''));
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('已複製');
    } catch {
      showToast('無法使用剪貼簿');
    }
  }

  function buildApiContents(messages) {
    return messages.map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.text }]
    }));
  }

  function normalizeBaseUrl(value) {
    return value.trim().replace(/\/+$/, '');
  }

  async function sendMessage(prefill) {
    if (abortController) {
      abortController.abort();
      return;
    }

    const text = (typeof prefill === 'string' ? prefill : els.promptInput.value).trim();
    if (!text) return;
    if (!state.settings.apiKey.trim()) {
      openSettings();
      showToast('請先輸入 Gemini API Key');
      return;
    }

    let conversation = currentConversation();
    if (!conversation) conversation = createConversation();

    conversation.messages.push({ role: 'user', text, timestamp: Date.now() });
    conversation.messages.push({ role: 'assistant', text: '', timestamp: Date.now(), streaming: true });
    if (conversation.title === '新對話') conversation.title = text.replace(/\s+/g, ' ').slice(0, 28);
    conversation.updatedAt = Date.now();
    els.promptInput.value = '';
    autoResizeInput();
    persist();
    render();
    setGenerating(true);

    abortController = new AbortController();
    const assistantMessage = conversation.messages.at(-1);

    try {
      const baseUrl = normalizeBaseUrl(state.settings.baseUrl);
      const model = encodeURIComponent(state.settings.model.trim());
      const url = `${baseUrl}/models/${model}:streamGenerateContent?alt=sse`;
      const history = conversation.messages.slice(0, -1);
      const payload = {
        contents: buildApiContents(history),
        generationConfig: { temperature: Number(state.settings.temperature) }
      };
      if (state.settings.systemPrompt.trim()) {
        payload.systemInstruction = { parts: [{ text: state.settings.systemPrompt.trim() }] };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': state.settings.apiKey.trim()
        },
        body: JSON.stringify(payload),
        signal: abortController.signal
      });

      if (!response.ok) {
        let details = '';
        try {
          const errorData = await response.json();
          details = errorData?.error?.message || JSON.stringify(errorData);
        } catch {
          details = await response.text();
        }
        throw new Error(`${response.status} ${response.statusText}${details ? `：${details}` : ''}`);
      }

      if (!response.body) throw new Error('瀏覽器未提供串流回應。');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const event of events) {
          const dataLines = event.split('\n').filter(line => line.startsWith('data:'));
          for (const line of dataLines) {
            const raw = line.slice(5).trim();
            if (!raw || raw === '[DONE]') continue;
            try {
              const data = JSON.parse(raw);
              const chunk = data?.candidates?.[0]?.content?.parts
                ?.map(part => part.text || '')
                .join('') || '';
              if (chunk) {
                assistantMessage.text += chunk;
                renderMessages();
              }
            } catch (parseError) {
              console.warn('忽略無法解析的串流片段：', parseError);
            }
          }
        }
      }

      if (!assistantMessage.text.trim()) assistantMessage.text = '模型沒有回傳文字內容。';
    } catch (error) {
      if (error.name === 'AbortError') {
        assistantMessage.text = assistantMessage.text.trim() || '（已停止生成）';
      } else {
        assistantMessage.text = `連線失敗：${error.message}\n\n請檢查 API Key、模型名稱、免費額度或瀏覽器網路限制。`;
      }
    } finally {
      assistantMessage.streaming = false;
      conversation.updatedAt = Date.now();
      abortController = null;
      persist();
      setGenerating(false);
      render();
    }
  }

  function setGenerating(active) {
    els.sendButton.classList.toggle('stop', active);
    els.sendButton.textContent = active ? '■' : '➤';
    els.sendButton.title = active ? '停止生成' : '傳送';
  }

  function openSettings() {
    const settings = state.settings;
    els.apiKeyInput.value = settings.apiKey;
    els.baseUrlInput.value = settings.baseUrl;
    els.modelInput.value = settings.model;
    els.systemPromptInput.value = settings.systemPrompt;
    els.temperatureInput.value = settings.temperature;
    els.temperatureOutput.value = settings.temperature;
    els.apiKeyInput.type = 'password';
    els.toggleKeyButton.textContent = '顯示';
    els.settingsDialog.showModal();
  }

  function saveSettings(event) {
    event.preventDefault();
    state.settings = {
      apiKey: els.apiKeyInput.value.trim(),
      baseUrl: normalizeBaseUrl(els.baseUrlInput.value) || defaultSettings.baseUrl,
      model: els.modelInput.value.trim() || defaultSettings.model,
      systemPrompt: els.systemPromptInput.value.trim(),
      temperature: Number(els.temperatureInput.value)
    };
    persist();
    els.settingsDialog.close();
    render();
    showToast('設定已儲存');
  }

  function exportConversation() {
    const conversation = currentConversation();
    if (!conversation?.messages.length) {
      showToast('目前沒有可匯出的對話');
      return;
    }
    const lines = [`# ${conversation.title}`, ''];
    conversation.messages.forEach(message => {
      lines.push(`## ${message.role === 'user' ? '你' : 'Gemini'}`, '', message.text, '');
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${conversation.title.replace(/[\\/:*?"<>|]/g, '_') || 'gemini-chat'}.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function clearAllData() {
    if (!confirm('確定清除 API Key、設定及全部對話紀錄？此動作無法復原。')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = { settings: { ...defaultSettings }, conversations: [], activeId: null };
    els.settingsDialog.close();
    render();
    showToast('全部資料已清除');
  }

  function autoResizeInput() {
    els.promptInput.style.height = 'auto';
    els.promptInput.style.height = `${Math.min(els.promptInput.scrollHeight, 190)}px`;
  }

  function scrollToBottom() {
    els.chatScroll.scrollTop = els.chatScroll.scrollHeight;
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.add('show');
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
  }

  function openSidebar() {
    els.sidebar.classList.add('open');
    els.sidebarBackdrop.classList.add('show');
  }

  function closeSidebar() {
    els.sidebar.classList.remove('open');
    els.sidebarBackdrop.classList.remove('show');
  }

  els.newChatButton.addEventListener('click', createConversation);
  els.menuButton.addEventListener('click', openSidebar);
  els.sidebarClose.addEventListener('click', closeSidebar);
  els.sidebarBackdrop.addEventListener('click', closeSidebar);
  els.settingsButton.addEventListener('click', openSettings);
  els.topSettingsButton.addEventListener('click', openSettings);
  els.exportButton.addEventListener('click', exportConversation);
  els.clearAllButton.addEventListener('click', clearAllData);
  els.settingsForm.addEventListener('submit', saveSettings);
  els.temperatureInput.addEventListener('input', () => {
    els.temperatureOutput.value = els.temperatureInput.value;
  });
  els.toggleKeyButton.addEventListener('click', () => {
    const isHidden = els.apiKeyInput.type === 'password';
    els.apiKeyInput.type = isHidden ? 'text' : 'password';
    els.toggleKeyButton.textContent = isHidden ? '隱藏' : '顯示';
  });
  els.promptInput.addEventListener('input', autoResizeInput);
  els.promptInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });
  els.sendButton.addEventListener('click', () => sendMessage());
  document.querySelectorAll('.suggestion').forEach(button => {
    button.addEventListener('click', () => {
      els.promptInput.value = button.dataset.prompt || '';
      autoResizeInput();
      els.promptInput.focus();
    });
  });

  render();
  autoResizeInput();
})();
