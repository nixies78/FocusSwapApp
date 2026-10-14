export const GOOGLE_APPS_SCRIPT_TEMPLATE = `/**
 * FocusDeck Google Docs Sync Webhook
 * Allows FocusDeck to read and update your Google Docs via AI.
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://script.google.com and click "New project"
 * 2. Replace the code in Code.gs with this entire script
 * 3. Click "Deploy" > "New deployment"
 * 4. Click the gear icon next to "Select type" and choose "Web app"
 * 5. Configuration:
 *    - Description: FocusDeck Google Docs Sync
 *    - Execute as: Me (your email)
 *    - Who has access: Anyone
 * 6. Click "Deploy", authorize Google permissions, and copy the Web App URL into FocusDeck!
 */

function doPost(e) {
  try {
    var data = {};
    if (e && e.postData && e.postData.contents) {
      data = JSON.parse(e.postData.contents);
    }
    
    var action = data.action || 'read';
    var docId = extractDocId(data.docUrl || data.docId);
    
    if (!docId) {
      return jsonResponse({ success: false, error: 'Missing or invalid Google Doc URL or ID' });
    }
    
    var doc = DocumentApp.openById(docId);
    
    if (action === 'read') {
      var bodyText = doc.getBody().getText();
      var title = doc.getName();
      return jsonResponse({ success: true, title: title, text: bodyText });
    }
    
    if (action === 'update') {
      if (typeof data.content !== 'string') {
        return jsonResponse({ success: false, error: 'Missing content to update' });
      }
      doc.getBody().setText(data.content);
      doc.saveAndClose();
      return jsonResponse({ success: true, title: doc.getName(), message: 'Document updated successfully' });
    }
    
    if (action === 'append') {
      if (typeof data.content !== 'string') {
        return jsonResponse({ success: false, error: 'Missing content to append' });
      }
      var body = doc.getBody();
      if (body.getText().length > 0) {
        body.appendParagraph('');
      }
      body.appendParagraph(data.content);
      doc.saveAndClose();
      return jsonResponse({ success: true, title: doc.getName(), message: 'Content appended successfully' });
    }
    
    return jsonResponse({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function doGet(e) {
  return jsonResponse({
    success: true,
    message: 'FocusDeck Google Docs Webhook is active and connected!'
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function extractDocId(input) {
  if (!input) return null;
  var str = input.toString().trim();
  var match = str.match(/\\/d\\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    return match[1];
  }
  return str;
}
`;

export async function readGoogleDoc(webhookUrl: string, docUrl: string): Promise<{ title: string; text: string }> {
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl) {
    throw new Error('Google Apps Script Webhook URL is not configured. Please open Settings.');
  }

  const res = await fetch(cleanUrl, {
    method: 'POST',
    // Using text/plain avoids CORS OPTIONS preflight issues with Google Apps Script
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action: 'read',
      docUrl: docUrl.trim(),
    }),
  });

  if (!res.ok) {
    throw new Error(`Google Webhook returned HTTP status ${res.status}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to read document from Google Docs.');
  }

  return {
    title: data.title || 'Untitled Document',
    text: data.text || '',
  };
}

export async function updateGoogleDoc(
  webhookUrl: string,
  docUrl: string,
  content: string,
  action: 'update' | 'append' = 'update'
): Promise<{ success: boolean; message: string }> {
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl) {
    throw new Error('Google Apps Script Webhook URL is not configured. Please open Settings.');
  }

  const res = await fetch(cleanUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({
      action,
      docUrl: docUrl.trim(),
      content,
    }),
  });

  if (!res.ok) {
    throw new Error(`Google Webhook returned HTTP status ${res.status}`);
  }

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || 'Failed to update Google Doc.');
  }

  return {
    success: true,
    message: data.message || 'Updated successfully',
  };
}

export async function testWebhook(webhookUrl: string): Promise<{ success: boolean; message: string }> {
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl) {
    throw new Error('Please enter a Webhook URL first.');
  }

  try {
    const res = await fetch(cleanUrl, {
      method: 'GET',
    });
    if (!res.ok) {
      return { success: false, message: `Server returned HTTP ${res.status}` };
    }
    const data = await res.json();
    if (data.success) {
      return { success: true, message: data.message || 'Webhook is active and ready!' };
    }
    return { success: false, message: data.error || 'Webhook returned error status' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Failed to reach Webhook URL' };
  }
}

export async function testOpenRouter(apiKey: string, model: string): Promise<{ success: boolean; message: string }> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('Please enter an OpenRouter API key first.');
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cleanKey}`,
        'HTTP-Referer': 'https://github.com/focusdeck/focusdeck',
        'X-Title': 'FocusDeck Test',
      },
      body: JSON.stringify({
        model: model || 'deepseek/deepseek-chat',
        messages: [{ role: 'user', content: 'Say "OK"' }],
        max_tokens: 5,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      let msg = `OpenRouter error (${res.status})`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) msg = parsed.error.message;
      } catch {}
      return { success: false, message: msg };
    }

    const data = await res.json();
    if (data.choices?.[0]?.message) {
      return { success: true, message: `Connected to ${model || 'OpenRouter'} successfully!` };
    }
    return { success: false, message: 'Invalid response structure from OpenRouter' };
  } catch (err: any) {
    return { success: false, message: err.message || 'Network error reaching OpenRouter' };
  }
}

export async function generateDocUpdate(
  apiKey: string,
  model: string,
  currentContent: string,
  newNotes: string,
  mode: 'merge' | 'append',
  customPrompt?: string,
  customSystemPrompt?: string
): Promise<string> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    throw new Error('OpenRouter API key is not configured. Please open Settings.');
  }

  const defaultSystemPrompt = `You are an expert document editor and knowledge base synthesizer.
Your task is to update a reference document with new notes and information provided by the user.
The document serves as a source of truth for Gemini notebooks.

CRITICAL RULES:
1. Preserve existing context, structure, tone, and formatting of the original document.
2. If mode is "Intelligent Merge": Intelligently weave the new facts, decisions, and updates into the most relevant existing sections. If the notes introduce a completely new topic or action item, create an appropriately titled section.
3. If mode is "Append Log": Create a clean, dated update entry (e.g. "### Update — [Date]") and append it neatly.
4. Replace or remove any information that is explicitly outdated or contradicted by the new notes.
5. Avoid unnecessary duplication.
6. Return ONLY the final complete updated document content. Do NOT include conversational filler, meta-explanations, or markdown block fences around the whole response (unless the document itself is markdown).`;

  const system = customSystemPrompt?.trim() || defaultSystemPrompt;

  const userMessage = `UPDATE MODE: ${mode === 'merge' ? 'Intelligent Merge' : 'Append Log'}

${customPrompt ? `SPECIFIC INSTRUCTIONS FOR THIS DOCUMENT:\n${customPrompt}\n` : ''}

=== CURRENT DOCUMENT CONTENT ===
${currentContent.trim() ? currentContent : '(The document is currently empty)'}

=== NEW INFORMATION / NOTES TO INTEGRATE ===
${newNotes}

Please produce the complete, updated document content now:`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cleanKey}`,
      'HTTP-Referer': 'https://github.com/focusdeck/focusdeck',
      'X-Title': 'FocusDeck',
    },
    body: JSON.stringify({
      model: model || 'deepseek/deepseek-chat',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let msg = `OpenRouter API error (${res.status})`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) msg = parsed.error.message;
    } catch {}
    throw new Error(msg);
  }

  const data = await res.json();
  const result = data.choices?.[0]?.message?.content;
  if (!result) {
    throw new Error('OpenRouter returned an empty response.');
  }

  return result.trim();
}
