import {
	EEFS,
	EEFS_ATTRIBUTE_NONE,
	EEFS_FILE_NOT_FOUND,
	EEFS_PERMISSION_DENIED,
	EEFS_READ_ONLY_FILE_SYSTEM,
	EEFS_SUCCESS,
	O_CREAT, O_RDONLY, O_TRUNC, O_WRONLY,
	SEEK_END
} from '@johntalton/eefs'

/**
 * @import { EEFSFileSystem, EEPROM } from '@johntalton/eefs'
 */

export const DEFAULT_BASE_ADDRESS = 0

const RESERVED_FILE_NAMES = [ '.', '..' ]
const RESERVED_FILE_NAME_CHARS = [ '/' ]
export function isValidFilename(name) {
	if(name === undefined) { return false }
	if(name === null) { return false }
	if(typeof name !== 'string') { return false }

	if(RESERVED_FILE_NAMES.includes(name)) { return false }

	for(const reservedChar of RESERVED_FILE_NAME_CHARS) {
		if(name.includes(reservedChar)) { return false }
	}

	return true
}

/**
 * @typedef {Object} EEFSStorageManagerOptions
 * @property {number} [baseAddress]
 * @property {Intl.Collator} [collator]
 * @property {TextEncoder} [encoder]
 * @property {TextDecoder} [decoder]
 */

export class EEFSStorageManager {
	/** @type {EEFSFileSystem} */
	#handle
	#root

	/**
	 * @param {EEPROM} eeprom
	 * @param {EEFSStorageManagerOptions} options
	 */
	static async from(eeprom, options) {
		const baseAddress = options?.baseAddress ?? DEFAULT_BASE_ADDRESS

		const fsOptions = {
			...options,
			eeprom
		}

		const handle = await EEFS.initFS(fsOptions, baseAddress)
		if(handle.status !== EEFS_SUCCESS) { throw new DOMException(`failed to init: ${handle.status} ${handle.why}`, 'InvalidStateError') }

		return new EEFSStorageManager(handle)
	}

	/**
	 * @param {EEFSFileSystem} handle
	 */
	constructor(handle) {
		this.#handle = handle
		this.#root = new EEFSFileSystemDirectoryHandle(this, '/')
	}

	get handle() { return this.#handle }

	async getDirectory() {
		return this.#root
	}
}

/** @implements {FileSystemHandle} */
export class EEFSFileHandle {
	#sm
	/** @type {FileSystemHandleKind} */
	kind
	name

	/**
	 * @param {EEFSStorageManager} sm
	 * @param {string} name
	 * @param {FileSystemHandleKind} type
	 */
	constructor(sm, name, type) {
		this.kind = type
		this.#sm = sm
		this.name = name
	}

	get storageManager() { return this.#sm }
	get handle() { return this.#sm.handle }

	async isSameEntry(other) {
		if(this.kind !== other.kind) { return false }

		throw new DOMException('', '')
	}
}

// /** @implements {FileSystemDirectoryHandle} */
export class EEFSFileSystemDirectoryHandle extends EEFSFileHandle {
	/**
	 * @param {EEFSStorageManager} sm
	 * @param {string} directoryName
	 */
	constructor(sm, directoryName) {
		super(sm, directoryName, 'directory')
		this.name = directoryName
	}

	async *[Symbol.asyncIterator]() {
		yield *this.entries()
	}

	/**
	 * @returns {AsyncGenerator<[string, EEFSFileSystemFileHandle]>}
	 */
	async *entries() {
		for await (const inodeEntry of EEFS.listInodes(this.handle)) {
			const { filename, inodeIndex } = inodeEntry
			const handle = new EEFSFileSystemFileHandle(this.storageManager, filename)
			yield [ filename, handle ]
		}
	}

	async *keys() {
		for await (const [ key, _ ] of this.entries()) {
			yield key
		}
	}

	async *values() {
		for await (const [ _, value ] of this.entries()) {
			yield value
		}
	}

	/**
	 * @param {string} name
	 * @param {FileSystemGetFileOptions} [options = {}]
	 */
	async getFileHandle(name, options = {}) {
		const create = options?.create ?? false
		// const flags = create ? O_CREAT | O_RDONLY : O_RDONLY
		// const attributes = EEFS_ATTRIBUTE_NONE

		if(!isValidFilename(name)) { throw new DOMException('Invalid file Name', 'InvalidCharacterError') }

		const stat = {}
		const statStatus = await EEFS.stat(this.handle, name, stat)
		if(statStatus === EEFS_SUCCESS) {
			// ok
		}
		else if(statStatus === EEFS_FILE_NOT_FOUND) {
			if(!create) {
				throw new DOMException('file does not exist and not in create mode', 'NotSupportedError')
			}
		}
		else {
			throw new DOMException(`error during stat file ${statStatus}`, 'InvalidStateError')
		}

		return new EEFSFileSystemFileHandle(this.storageManager, name, options)
	}

	/**
	 * @param {string} name
	 * @param {FileSystemGetDirectoryOptions} [options = {}]
	 * @returns {Promise<FileSystemDirectoryHandle>}
	 */
	async getDirectoryHandle(name, options = {}) { throw new DOMException('sub directory not supported', 'NotSupportedError') }

	/**
	 * @param {string} name
	 * @param {FileSystemRemoveOptions} [options = {}]
	 */
	async removeEntry(name, options = {}) {
		const recursive = options?.recursive ?? false

		const status = await EEFS.remove(this.handle, name)
		if(status === EEFS_FILE_NOT_FOUND) { throw new DOMException('File Not Found', 'NotFoundError') }
		if((status === EEFS_PERMISSION_DENIED) || (status === EEFS_READ_ONLY_FILE_SYSTEM)) { throw new DOMException('Permission Denied or Read Only', 'NotAllowedError') }
		if(status !== EEFS_SUCCESS) { throw new TypeError(`Error removing file ${status}`) }
	}

	/**
	 * @param {FileSystemHandle} possibleDescendant
	 */
	async resolve(possibleDescendant) {
		if(!(possibleDescendant instanceof EEFSFileHandle)) { return null }
		if(this.storageManager !== possibleDescendant.storageManager) { return null }

		// this dir is the only top level dir, so ... just the file
		return [ possibleDescendant.name ]
	}
}

// /** @implements {FileSystemFileHandle} */
export class EEFSFileSystemFileHandle extends EEFSFileHandle {
	#options

	/**
	 * @param {EEFSStorageManager} sm
	 * @param {FileSystemGetFileOptions} [options]
	 * @param {string} filename
	 */
	constructor(sm, filename, options) {
		super(sm, filename, 'file')
		this.#options = options
	}

	async getFile() {
		const flags = O_RDONLY
		const attributes = EEFS_ATTRIBUTE_NONE

		const fd = await EEFS.open(this.handle, this.name, flags, attributes)
		if(fd < 0) { throw new DOMException('', 'NotFoundError') }

		const stat = {}
		const statStatus = await EEFS.fstat(this.handle, fd, stat)
		if(statStatus !== EEFS_SUCCESS) { throw new DOMException(`stat for fd ${statStatus}`, 'InvalidStateError') }

		const into = new ArrayBuffer(stat.fileSize)
		const bytesRead = await EEFS.read(this.handle, fd, stat.fileSize, into)
		if(bytesRead < 0 ) { throw new DOMException(`read failed ${bytesRead}`, 'InvalidStateError') }

		const closeStatus = await EEFS.close(this.handle, fd)
		if(closeStatus !== EEFS_SUCCESS) { throw new DOMException('', 'InvalidStateError') }

		return new File([ into ], this.name, { type: 'application/octet-stream', lastModified: stat.modificationDate * 1000 })
	}

	/**
	 * @param {FileSystemCreateWritableOptions} [options]
	 */
	async createWritable(options) {
		const writable = new EEFSFileSystemWritableStream(this.handle, this.name, {
			...this.#options,
			...options
		})
		return writable
	}

	async createSyncAccessHandle() {
		throw new Error('no impl')
	}
}

export class EEFSFileSystemWritableStreamUnderlyingSink {
	#handle
	#name
	#fd
	#options

	/**
	 * @param {EEFSFileSystem} handle
	 * @param {string} name
	 * @param {FileSystemCreateWritableOptions & FileSystemGetDirectoryOptions} options
	 */
	constructor(handle, name, options) {
		this.#handle = handle
		this.#name = name
		this.#options = options
	}

	async start(controller) {
		const create = this.#options?.create ?? false
		const keepExistingData = this.#options?.keepExistingData ?? false

		console.log('START', create, keepExistingData)

		const flags = (create ? O_CREAT|O_WRONLY : O_WRONLY) | (keepExistingData ? 0 : O_TRUNC)
		this.#fd = await EEFS.open(this.#handle, this.#name, flags, EEFS_ATTRIBUTE_NONE)
		if(this.#fd  < 0) { throw new DOMException(`open error ${this.#fd}`, 'NotFoundError') }

		if(keepExistingData) {
			EEFS.seek(this.#handle, this.#fd, 0, SEEK_END)
		}
	}

	static async #asBuffer(chunk) {
		if(chunk === undefined) { throw new Error('chunk undefined') }

		if(chunk instanceof Blob) { return chunk.arrayBuffer() }
		else if(chunk instanceof ArrayBuffer) { return chunk }
		else if(ArrayBuffer.isView(chunk)) { return chunk }
		else if((chunk instanceof String) || (typeof chunk === 'string')) {
			const encoder = new TextEncoder()
			return encoder.encode(chunk.toString())
		}

		throw new Error('unknown chunk type')
	}

	/**
	 * @param {FileSystemWriteChunkType} chunk
	 */
	async write(chunk, controller) {
		const buffer = await EEFSFileSystemWritableStreamUnderlyingSink.#asBuffer(chunk)
		const status = await EEFS.write(this.#handle, this.#fd, buffer, buffer.byteLength)
		if(status !== EEFS_SUCCESS) { throw new Error(`write error ${status}`) }
	}

	async close(controller) {
		await EEFS.close(this.#handle, this.#fd)
	}

	abort(reason) {}
}

/** @implements {FileSystemWritableFileStream} */
export class EEFSFileSystemWritableStream extends WritableStream {
	/**
	 * @param {EEFSFileSystem} handle
	 * @param {string} name
	 * @param {FileSystemCreateWritableOptions & FileSystemGetDirectoryOptions} options
	 */
	constructor(handle, name, options) {
		super(new EEFSFileSystemWritableStreamUnderlyingSink(handle, name, options), {
			highWaterMark: 1,
			size(chunk) { return 1 }
		})
	}

	async seek(position) {
		throw new Error('Method not implemented.')
	}

	async truncate(size) {
		throw new Error('Method not implemented.')
	}

	/**
	 * @param {FileSystemWriteChunkType} data
	 */
	async write(data) {
		const writer = this.getWriter()
		await writer.write(data)
		return writer.close()
	}
}