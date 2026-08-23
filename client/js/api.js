/* Thin wrapper around the REST endpoints exposed by the server. */

const Api = (() => {
  const BASE = '/api/rooms';

  async function request(url, options = {}) {
    const res = await fetch(url, options);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const message = (data && data.error) || `Request failed (${res.status})`;
      const err = new Error(message);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function createRoom() {
    return request(BASE, { method: 'POST' });
  }

  function getConfig() {
    return request('/api/config');
  }

  function getRoom(code) {
    return request(`${BASE}/${encodeURIComponent(code)}`);
  }

  function deleteFile(code, fileId) {
    return request(`${BASE}/${encodeURIComponent(code)}/files/${encodeURIComponent(fileId)}`, {
      method: 'DELETE'
    });
  }

  function downloadFileUrl(code, fileId) {
    return `${BASE}/${encodeURIComponent(code)}/files/${encodeURIComponent(fileId)}`;
  }

  /**
   * Uploads a file with progress reporting via XHR (fetch doesn't expose
   * upload progress events).
   */
  function uploadFile(code, file, senderId, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('senderId', senderId || '');

      xhr.open('POST', `${BASE}/${encodeURIComponent(code)}/files`);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      xhr.addEventListener('load', () => {
        let data = null;
        try {
          data = JSON.parse(xhr.responseText);
        } catch (e) {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error((data && data.error) || 'Upload failed.'));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error during upload.')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

      xhr.send(formData);
    });
  }

  return { createRoom, getRoom, getConfig, deleteFile, downloadFileUrl, uploadFile };
})();
