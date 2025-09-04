import {
	EEFS,
	EEFS_ATTRIBUTE_NONE,
	EEFS_SUCCESS,
	O_CREAT, O_RDONLY, O_RDWR, O_WRONLY
} from '@johntalton/eefs'

/**
 * @import { EEFSFileSystem, EEFSFileSystemOptions, EEPROM } from '@johntalton/eefs'
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
		const collator = options?.collator ?? new Intl.Collator()
		const encoder = options?.encoder ?? new TextEncoder()
		const decoder = options?.decoder ?? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

		const fsOptions = {
			eeprom,
			collator,
			encoder,
			decoder
		}

		const handle = await EEFS.initFS(fsOptions, baseAddress)
		if(handle.status !== EEFS_SUCCESS) { throw new DOMException(`failed to init: ${handle.status}`, 'InvalidStateError') }

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

export class EEFSFileHandle {
	#sm
	kind
	name

	/**
	 * @param {EEFSStorageManager} sm
	 * @param {string} name
	 */
	constructor(sm, name) {
		this.#sm = sm
		this.name = name
	}

	get storageManager() { return this.#sm }
	get handle() { return this.#sm.handle }

	async isSameEntry(other) {
		throw new DOMException('', '')
	}
}

export class EEFSFileSystemDirectoryHandle extends EEFSFileHandle {
	kind = 'directory'

	/**
	 * @param {EEFSStorageManager} sm
	 * @param {string} directoryName
	 */
	constructor(sm, directoryName) {
		super(sm, directoryName)
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
		const flags = create ? O_CREAT | O_RDONLY : O_RDONLY
		const attributes = EEFS_ATTRIBUTE_NONE

		const fd = await EEFS.open(this.handle, name, flags, attributes)
		if(fd < 0) { throw new DOMException(`open error ${fd}`, 'NotFoundError') }

		// const stat = {}
		// const statStatus = await EEFS.fstat(this.handle, fd, stat)
		// if(statStatus !== EEFS_SUCCESS) { throw new DOMException(`stat for fd ${statStatus}`, 'InvalidStateError') }

		const closeStatus = await EEFS.close(this.handle, fd)
		if(closeStatus !== EEFS_SUCCESS) { throw new DOMException('', 'InvalidStateError') }

		return new EEFSFileSystemFileHandle(this.storageManager, name)
	}

	/**
	 * @param {string} name
	 * @param {FileSystemGetDirectoryOptions} [options = {}]
	 */
	async getDirectoryHandle(name, options = {}) { throw new DOMException('sub directory not supported', 'NotSupportedError') }

	/**
	 * @param {string} name
	 * @param {FileSystemRemoveOptions} [options = {}]
	 */
	async removeEntry(name, options = {}) {
		const recursive = options?.recursive ?? false

		throw new Error('no impl')
	}

	/**
	 * @param {FileSystemHandle} possibleDescendant
	 */
	async resolve(possibleDescendant) {
		throw new Error('no impl')
	}
}

export class EEFSFileSystemFileHandle extends EEFSFileHandle {
	kind = 'file'

	/**
	 * @param {EEFSStorageManager} sm
	 * @param {string} filename
	 */
	constructor(sm, filename) {
		super(sm, filename)
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
	 * @returns {Promise<WritableStream>}
	 */
	async createWritable(options) {
		const keepExistingData = options?.keepExistingData ?? false
		const writable = new EEFSFileSystemWritableStream(this.handle, this.name)
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

	/**
	 * @param {EEFSFileSystem} handle
	 * @param {string} name
	 */
	constructor(handle, name) {
		this.#handle = handle
		this.#name = name
	}

	async start(controller) {
		this.#fd = await EEFS.open(this.#handle, this.#name, O_WRONLY, EEFS_ATTRIBUTE_NONE)
		if(this.#fd  < 0) { throw new DOMException(`open error ${this.#fd}`, 'NotFoundError') }

	}

	/**
	 * @param {FileSystemWriteChunkType} chunk
	 */
	async write(chunk, controller) {
		if(chunk instanceof Blob) { throw new Error('not yet (Blob)') }
		else if(chunk instanceof ArrayBuffer) { throw new Error('not yet (ArrayBuffer)') }
		else if(ArrayBuffer.isView(chunk)) {
			// console.log('Underlying Sink Write Chunk,', chunk.byteLength, chunk)
			const status = await EEFS.write(this.#handle, this.#fd, chunk, chunk.byteLength)
			if(status !== EEFS_SUCCESS) { throw new Error(`write error ${status}`) }
			return
		}
		else if((chunk instanceof String) || (typeof chunk === 'string')) { throw new Error('not yet (string)') }

		throw new Error('unknown chunk type')
	}

	async close(controller) {
		await EEFS.close(this.#handle, this.#fd)
	}

	abort(reason) {}
}

export class EEFSFileSystemWritableStream extends WritableStream {
	/**
	 * @param {EEFSFileSystem} handle
	 * @param {string} name
	 */
	constructor(handle, name) {
		super(new EEFSFileSystemWritableStreamUnderlyingSink(handle, name), {
			highWaterMark: 1,
			size(chunk) { return 1 }
		})
	}

	/**
	 * @param {FileSystemWriteChunkType} data
	 */
	async write(data) {
		const writer = this.getWriter()
		await writer.write(data)
		writer.releaseLock()
	}
}