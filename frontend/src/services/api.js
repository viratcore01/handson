/**
 * Centralized API client for the Adaptive Handwriting Coach.
 *
 * Every page imports from here instead of calling fetch() directly.
 * Handles JSON, multipart uploads, file downloads, and errors uniformly.
 */

const API_BASE = import.meta.env.VITE_API_URL || ''

// -----------------------------------------------------------
// Internal helpers
// -----------------------------------------------------------

class ApiError extends Error {
  constructor(status, detail) {
    super(detail || `API error ${status}`)
    this.status = status
    this.detail = detail
  }
}

async function request(method, path, { body, headers: extraHeaders } = {}) {
  const url = `${API_BASE}${path}`
  const init = {
    method,
    headers: { ...extraHeaders },
  }

  if (body !== undefined && body !== null) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  const res = await fetch(url, init)
  if (!res.ok) {
    let detail = ''
    try {
      const err = await res.json()
      detail = err.detail || err.message || JSON.stringify(err)
    } catch {
      detail = res.statusText
    }
    throw new ApiError(res.status, detail)
  }

  // Some endpoints may return 204 No Content
  if (res.status === 204) return null
  return res.json()
}

// -----------------------------------------------------------
// Public API
// -----------------------------------------------------------

/** GET request, returns parsed JSON. */
export function apiGet(path) {
  return request('GET', path)
}

/** POST JSON body, returns parsed JSON response. */
export function apiPost(path, body) {
  return request('POST', path, { body })
}

/** PATCH JSON body, returns parsed JSON response. */
export function apiPatch(path, body) {
  return request('PATCH', path, { body })
}

/**
 * Upload a file via multipart/form-data.
 * @param {string} path       - API path (e.g. "/api/scans?student_id=s0")
 * @param {File|Blob} file    - The file to upload
 * @param {string} fieldName  - Form field name (default "file")
 * @param {Record<string,string>} extraFields - Additional form fields
 * @returns {Promise<any>} Parsed JSON response
 */
export async function apiUpload(path, file, fieldName = 'file', extraFields = {}) {
  const url = `${API_BASE}${path}`
  const form = new FormData()
  form.append(fieldName, file, file.name || 'upload')
  for (const [k, v] of Object.entries(extraFields)) {
    form.append(k, v)
  }

  const res = await fetch(url, { method: 'POST', body: form })
  if (!res.ok) {
    let detail = ''
    try {
      const err = await res.json()
      detail = err.detail || err.message || JSON.stringify(err)
    } catch {
      detail = res.statusText
    }
    throw new ApiError(res.status, detail)
  }
  return res.json()
}

/**
 * Download a file from a URL and trigger a browser download.
 * @param {string} url        - Full URL or path to download
 * @param {string} filename   - Suggested filename
 */
export async function apiDownload(url, filename) {
  const fullUrl = url.startsWith('http') ? url : `${API_BASE}${url}`
  const res = await fetch(fullUrl)
  if (!res.ok) throw new ApiError(res.status, 'Download failed')
  const blob = await res.blob()
  const blobUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = blobUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(blobUrl)
}

// Convenience re-exports for backward compatibility
export { apiGet as api }
export { ApiError }
