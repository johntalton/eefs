import { EEFS, EEFS_ATTRIBUTE_NONE, EEFS_SUCCESS, O_CREAT, O_RDONLY, O_RDWR } from '@johntalton/eefs'

/**
 * @import { EEFSFileSystem } from '@johntalton/eefs'
 */

export const DEFAULT_BASE_ADDRESS = 0

export class EEFSStorageManager {
	/** @type {EEFSFileSystem} */
	#fs
	#root

	static async from(eeprom, options) {
		const baseAddress = options?.baseAddress ?? DEFAULT_BASE_ADDRESS
		const collator = options?.collator ?? new Intl.Collator()
		const encoder = options?.encoder ?? new TextEncoder()
		const decoder = options?.decoder ?? new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

		/** @type {EEFSFileSystem} */
		const fs = {
			eeprom,
			inodeTable: {
				baseAddress,
				freeMemoryPointer: 0,
				freeMemorySize: 0,
				numberOfFiles: 0,
				files: []
			},
			fileDescriptorTable: [],
			fileDescriptorsInUse: 0,
			fileDescriptorsHighWaterMark: 0,
			directoryDescriptor: {},
			directoryEntry: {},

			collator,
			encoder,
			decoder
		}

		const status = await EEFS.initFS(fs, baseAddress)
		if(status !== EEFS_SUCCESS) { throw new DOMException(`failed to init: ${status}`, 'InvalidStateError') }

		return new EEFSStorageManager(fs)
	}

	/**
	 * @param {EEFSFileSystem} fs
	 */
	constructor(fs) {
		this.#fs = fs
		this.#root = new EEFSFileSystemDirectoryHandle(fs, '/')
	}

	get filesystem() { return this.#fs }

	async getDirectory() {
		return this.#root
	}
}

export class EEFSFileHandle {
	#fs
	kind
	name

	constructor(fs, name) {
		this.#fs = fs
		this.name = name
	}

	get filesystem() { return this.#fs }

	async isSameEntry(other) {}
}

export class EEFSFileSystemDirectoryHandle extends EEFSFileHandle {
	kind = 'directory'

	constructor(fs, directoryName) {
		super(fs, directoryName)
	}

	async *[Symbol.asyncIterator]() {
		yield *this.entries()
	}

	/**
	 * @returns {AsyncGenerator<[string, EEFSFileSystemFileHandle]>}
	 */
	async *entries() {
		for await (const inodeEntry of EEFS.listInodes(this.filesystem)) {
			const { filename, inodeIndex } = inodeEntry
			const handle = new EEFSFileSystemFileHandle(this.filesystem, filename, inodeIndex)
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

	async getFileHandle(name, options) {
		const create = options?.create ?? false
		const flags = create ? O_CREAT | O_RDWR : O_RDWR
		const attributes = EEFS_ATTRIBUTE_NONE

		const fd = await EEFS.open(this.filesystem, name, flags, attributes)
		if(fd < 0) { throw new DOMException('', 'NotFoundError') }

		const stat = {}
		const statStatus = await EEFS.fstat(this.filesystem, fd, stat)
		if(statStatus !== EEFS_SUCCESS) { throw new DOMException(`stat for fd ${statStatus}`, 'InvalidStateError') }

		const closeStatus = await EEFS.close(this.filesystem, fd)
		if(closeStatus !== EEFS_SUCCESS) { throw new DOMException('', 'InvalidStateError') }

		return new EEFSFileSystemFileHandle(this.filesystem, name, stat.inodeIndex)
	}

	async getDirectoryHandle(name, options) { throw new DOMException('sub directory not supported', 'NotSupportedError') }

	async removeEntry() {}
	async resolve() {}
}

export class EEFSFileSystemFileHandle extends EEFSFileHandle {
	#inodeIndex
	kind = 'file'

	constructor(fs, filename, inodeIndex) {
		super(fs, filename)
	}

	async getFile() {
		const flags = O_RDONLY
		const attributes = EEFS_ATTRIBUTE_NONE

		const fd = await EEFS.open(this.filesystem, this.name, flags, attributes)
		if(fd < 0) { throw new DOMException('', 'NotFoundError') }

		const stat = {}
		const statStatus = await EEFS.fstat(this.filesystem, fd, stat)
		if(statStatus !== EEFS_SUCCESS) { throw new DOMException(`stat for fd ${statStatus}`, 'InvalidStateError') }

		const into = new ArrayBuffer(stat.fileSize)
		const bytesRead = await EEFS.read(this.filesystem, fd, stat.fileSize, into)
		if(bytesRead < 0 ) { throw new DOMException(`read failed ${bytesRead}`, 'InvalidStateError') }

		const closeStatus = await EEFS.close(this.filesystem, fd)
		if(closeStatus !== EEFS_SUCCESS) { throw new DOMException('', 'InvalidStateError') }

		return new File([ into ], this.name, { type: 'application/octet-stream', lastModified: stat.modificationDate * 1000 })
	}
	async createWritable() {

	}

	async createSyncAccessHandle() {}
}