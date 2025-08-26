import {
	EEFS_ATTRIBUTE_NONE,
	EEFS_ATTRIBUTE_READONLY,
	EEFS_DEFAULT_CREAT_SPARE_BYTES,
	EEFS_DEVICE_IS_BUSY,
	EEFS_FCREAT,
	EEFS_FILE_NOT_FOUND,
	EEFS_FILESYS_MAGIC,
	EEFS_FREAD,
	EEFS_FWRITE, EEFS_INVALID_ARGUMENT,
	EEFS_LIB_IS_WRITE_PROTECTED,
	EEFS_MAX_FILENAME_SIZE,
	EEFS_MAX_FILES,
	EEFS_MAX_OPEN_FILES,
	EEFS_NO_FREE_FILE_DESCRIPTOR,
	EEFS_NO_SPACE_LEFT_ON_DEVICE,
	EEFS_NO_SUCH_DEVICE,
	EEFS_PERMISSION_DENIED,
	EEFS_READ_ONLY_FILE_SYSTEM,
	EEFS_SUCCESS,
	O_ACCMODE,
	O_CREAT,
	O_RDONLY,
	O_RDWR,
	O_TRUNC,
	O_WRONLY } from './defs.js'
import {
	FILE_ALLOCATION_TABLE_ENTRY_SIZE,
	FILE_ALLOCATION_TABLE_HEADER_SIZE,
	FILE_HEADER_SIZE,
	INUSE} from './types.js'

/**
 * @import {
 *  EEPROM,
 *  EEFSFileSystem,
 *  StatusCode,
 *  Header,
 *  InodeTable,
 *  FileAllocationTableEntry,
 *  FileHeader,
 *  FileDescriptorTable,
 *  FileDescriptorIndex,
 *  FileDescriptor,
 *  FileDescriptorMode,
 *  FileAttributes,
 *  Stat,
 *  DirectoryDescriptor,
 *  DirectoryEntry
 * } from './types.js'
 */

/**
 * @param {number} start
 * @param {number} end
 * @param {number} [step = 1]
 * @returns {Generator<number>}
 */
export function* range(start, end, step = 1) {
	yield start
	if (start >= end) return
	yield* range(start + step, end, step)
}

/**
 * @param {number} value
 * @param {number} align
 * @returns {number}
 */
export function roundUp(value, align) {
	return (value + (align - 1)) & ~(align - 1)
}

/**
 * @param {Uint8Array} u8
 */
export function stripZeroU8(u8) {
	const zeroIndex = u8.findIndex(value => value === 0)
	if(zeroIndex === -1) { return u8 }

	return u8.subarray(0, zeroIndex)
}


export class Common {
	/**
	 * @param {number} baseAddress
	 * @returns {Promise<Header>}
	 */
	static async readHeader(eeprom, baseAddress) {
		const ab = await eeprom.read(baseAddress, FILE_ALLOCATION_TABLE_HEADER_SIZE)
		const dv = ArrayBuffer.isView(ab) ?
			new DataView(ab.buffer, ab.byteOffset) :
			new DataView(ab)

		const littleEndian = false
		const CRC = dv.getUint32(0, littleEndian)
		const magic = dv.getUint32(4, littleEndian)
		const version = dv.getUint32(8, littleEndian)
		const freeMemoryOffset = dv.getUint32(12, littleEndian)
		const freeMemorySize = dv.getUint32(16, littleEndian)
		const numberOfFiles = dv.getUint32(20, littleEndian)

		return {
			CRC,
			magic,
			version,
			freeMemoryOffset,
			freeMemorySize,
			numberOfFiles
		}
	}

	/**
	 * @param {EEPROM} eeprom
	 */
	static async writeHeader(eeprom, baseAddress, header) {
		const headerBuffer = new ArrayBuffer(FILE_ALLOCATION_TABLE_HEADER_SIZE)
		const dv = new DataView(headerBuffer)

		const littleEndian = false
		dv.setUint32(0, header.CRC, littleEndian)
		dv.setUint32(4, header.magic, littleEndian)
		dv.setUint32(8, header.version, littleEndian)
		dv.setUint32(12, header.freeMemoryOffset, littleEndian)
		dv.setUint32(16, header.freeMemorySize, littleEndian)
		dv.setUint32(20, header.numberOfFiles, littleEndian)

		return eeprom.write(baseAddress, headerBuffer)
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {InodeTable} inodeTable
	 * @param {number} inodeIndex
	 * @returns {Promise<FileAllocationTableEntry>}
	 */
	static async readFATEntry(eeprom, inodeTable, inodeIndex) {
		const offset = inodeTable.baseAddress + FILE_ALLOCATION_TABLE_HEADER_SIZE + (inodeIndex * FILE_ALLOCATION_TABLE_ENTRY_SIZE)
		const ab = await eeprom.read(offset, FILE_ALLOCATION_TABLE_ENTRY_SIZE)
		const dv = ArrayBuffer.isView(ab) ?
			new DataView(ab.buffer, ab.byteOffset, ab.byteLength) :
			new DataView(ab, 0, ab.byteLength)

		const littleEndian = false
		const fileHeaderOffset = dv.getUint32(0, littleEndian)
		const maxFileSize = dv.getUint32(4, littleEndian)

		return {
			fileHeaderOffset,
			maxFileSize
		}
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {InodeTable} inodeTable
	 * @param {number} inodeIndex
	 * @param {FileAllocationTableEntry} fatEntry
	 * @returns {Promise}
	 */
	static async writeFATEntry(eeprom, inodeTable, inodeIndex, fatEntry) {
		const offset = inodeTable.baseAddress + FILE_ALLOCATION_TABLE_HEADER_SIZE + (inodeIndex * FILE_ALLOCATION_TABLE_ENTRY_SIZE)
		const ab = new ArrayBuffer(FILE_ALLOCATION_TABLE_ENTRY_SIZE)
		const dv = new DataView(ab)

		const littleEndian = false
		dv.setUint32(0, fatEntry.fileHeaderOffset, littleEndian)
		dv.setUint32(4, fatEntry.maxFileSize, littleEndian)

		return eeprom.write(offset, ab)
	}


	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @returns {Promise<FileHeader>}
	 */
	static async readFileHeader(eeprom, decoder, offset) {
		const ab = await eeprom.read(offset, FILE_HEADER_SIZE)
		const dv = ArrayBuffer.isView(ab) ?
			new DataView(ab.buffer, ab.byteOffset, ab.byteLength) :
			new DataView(ab, 0, ab.byteLength)

		const littleEndian = false
		const CRC = dv.getUint32(0, littleEndian)
		const inUse = dv.getUint32(4, littleEndian)
		const attributes = dv.getUint32(8, littleEndian)
		const fileSize = dv.getUint32(12, littleEndian)

		const modificationDate = dv.getUint32(16, littleEndian)
		const creationDate = dv.getUint32(20, littleEndian)

		const filenameBuffer = stripZeroU8(new Uint8Array(dv.buffer, dv.byteOffset + 24, EEFS_MAX_FILENAME_SIZE))
		const filename = decoder.decode(filenameBuffer)

		return {
			CRC,
			inUse: inUse === INUSE.TRUE,
			attributes,
			fileSize,
			modificationDate,
			creationDate,
			filename
		}
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {TextEncoder} encoder
	 * @param {number} offset
	 * @param {FileHeader} fileHeader
	 */
	static async writeFileHeader(eeprom, encoder, offset, fileHeader) {
		const fileHeaderBuffer = new ArrayBuffer(FILE_HEADER_SIZE)
		const dv = new DataView(fileHeaderBuffer)

		const littleEndian = false
		dv.setUint32(0, fileHeader.CRC, littleEndian)
		dv.setUint32(4, fileHeader.inUse ? INUSE.TRUE : INUSE.FALSE, littleEndian)
		dv.setUint32(8, fileHeader.attributes, littleEndian)
		dv.setUint32(12, fileHeader.fileSize, littleEndian)
		dv.setUint32(16, fileHeader.modificationDate, littleEndian)
		dv.setUint32(20, fileHeader.creationDate, littleEndian)

		const filenameBufferU8 = encoder.encode(fileHeader.filename)
		const fileHeaderBufferU8 = new Uint8Array(fileHeaderBuffer, dv.byteOffset + 24, EEFS_MAX_FILENAME_SIZE)
		fileHeaderBufferU8.set(filenameBufferU8)

		return eeprom.write(offset, fileHeaderBuffer)
	}


	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @param {number} length
	 * @param {AllowSharedBufferSource} target
	 */
	static async readData(eeprom, offset, length, target) {
		const ab = await eeprom.read(offset, length, target)

		// const targetU8 = ArrayBuffer.isView(target) ?
		// 	new Uint8Array(target.buffer, target.byteOffset, target.byteLength) :
		// 	new Uint8Array(target, 0, target.byteLength)

		// const u8 = ArrayBuffer.isView(ab) ?
		// 	new Uint8Array(ab.buffer, ab.byteOffset, ab.byteLength) :
		// 	new Uint8Array(ab, 0, ab.byteLength)

		// targetU8.set(u8)

		return ab
	}

	/**
	 * @param {EEPROM} eeprom
	 * @param {number} offset
	 * @param {AllowSharedBufferSource} buffer
	 * @param {number} length
	 */
	static async writeData(eeprom, offset, length, buffer) {
		// todo respect length
		return eeprom.write(offset, buffer)
	}
}


export class EEFS {
	/**
	 * @param {EEFSFileSystem} fs
	 * @param {number} baseAddress
	 * @returns {Promise<StatusCode>}
	 */
	static async initFS(fs, baseAddress) {
		const header = await Common.readHeader(fs.eeprom, baseAddress)

		if(header.magic !== EEFS_FILESYS_MAGIC) { return EEFS_NO_SUCH_DEVICE }
		if(header.version !== 1) { return EEFS_NO_SUCH_DEVICE }
		if(header.numberOfFiles > EEFS_MAX_FILES) { return EEFS_NO_SUCH_DEVICE }

		const files = await Promise.all([ ...range(0, header.numberOfFiles)].map(async i => {
			const fatEntry = await Common.readFATEntry(fs.eeprom, fs.inodeTable, i)
			return {
				fileHeaderPointer: baseAddress + fatEntry.fileHeaderOffset,
				maxFileSize: fatEntry.maxFileSize
			}
		}))

		fs.inodeTable.baseAddress = baseAddress
		fs.inodeTable.freeMemoryPointer = baseAddress + header.freeMemoryOffset
		fs.inodeTable.freeMemorySize = header.freeMemorySize
		fs.inodeTable.numberOfFiles = header.numberOfFiles
		fs.inodeTable.files = files

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @returns {StatusCode}
	 */
	static freeFS(fs) {
		if(EEFS.hasOpenFiles(fs)) { return EEFS_DEVICE_IS_BUSY }
		if(EEFS.hasOpenDir(fs)) { return EEFS_DEVICE_IS_BUSY }

		fs.inodeTable.baseAddress = 0
		fs.inodeTable.freeMemoryPointer = 0
		fs.inodeTable.freeMemorySize = 0
		fs.inodeTable.numberOfFiles = 0
		fs.inodeTable.files = []

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @param {number} flags
	 * @param {FileAttributes} attributes
	 * @returns {Promise<StatusCode|FileDescriptorIndex>}
	 */
	static async open(fs, filename, flags, attributes) {
		if(!EEFS.#isValidFileName(fs, filename)){ return EEFS_INVALID_ARGUMENT }

		const inodeIndex = await EEFS.#findFile(fs, filename)
		if(inodeIndex !== EEFS_FILE_NOT_FOUND) {
			return EEFS.#openFile(fs, inodeIndex, flags, attributes)
		}
		else if(flags & O_CREAT) {
			return EEFS.#createFile(fs, filename, EEFS_ATTRIBUTE_NONE)
		}

		return EEFS_FILE_NOT_FOUND
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @param {FileAttributes} attributes
	 * @returns {Promise<StatusCode|FileDescriptorIndex>}
	 */
	static async create(fs, filename, attributes) {
		if(!EEFS.#isValidFileName(fs, filename)) { return EEFS_INVALID_ARGUMENT }

		const inodeIndex = await EEFS.#findFile(fs, filename)
		if(inodeIndex !== EEFS_FILE_NOT_FOUND) {
			return EEFS.#openFile(fs, inodeIndex, (O_WRONLY | O_TRUNC), attributes)
		}

		return EEFS.#createFile(fs, filename, attributes)
	}

	/**
	* @param {EEFSFileSystem} fs
	 * @param {number} inodeIndex
	 * @param {number} flags
	 * @param {FileAttributes} attributes
	 * @returns {Promise<StatusCode|FileDescriptorIndex>}
	 */
	static async #openFile(fs, inodeIndex, flags, attributes) {
		const openingReadonly = (flags & O_ACCMODE) === O_RDONLY

		if((flags & ~(O_RDONLY | O_WRONLY | O_RDWR | O_TRUNC | O_CREAT)) !== 0) { return EEFS_INVALID_ARGUMENT }
		if(!openingReadonly && EEFS_LIB_IS_WRITE_PROTECTED) { return EEFS_READ_ONLY_FILE_SYSTEM }

		const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer)
		if(!openingReadonly && ((fileHeader.attributes & EEFS_ATTRIBUTE_READONLY) !== 0)) { return EEFS_PERMISSION_DENIED }

		const fmode = EEFS.#fmode(fs, inodeIndex)
		if(!openingReadonly && ((fmode & EEFS_FWRITE) !== 0)) { return EEFS_PERMISSION_DENIED }

		const fileDescriptor = EEFS.#getFileDescriptor(fs)
		if(fileDescriptor === EEFS_NO_FREE_FILE_DESCRIPTOR) { return EEFS_NO_FREE_FILE_DESCRIPTOR }

		const openingWriteOnly = (flags & O_ACCMODE) == O_WRONLY
		const openingReadWrite = (flags & O_ACCMODE) == O_RDWR
		const truncate = (openingWriteOnly || openingReadWrite)  && (flags & O_TRUNC)

		fs.fileDescriptorTable[fileDescriptor] = {
			inUse: true,
			mode: (flags & O_ACCMODE) + 1,
			fileHeaderPointer: fs.inodeTable.files[inodeIndex].fileHeaderPointer,
			fileDataPointer: fs.inodeTable.files[inodeIndex].fileHeaderPointer + FILE_HEADER_SIZE,
			byteOffset: 0,
			fileSize: truncate ? 0 : fileHeader.fileSize,
			maxFileSize: fs.inodeTable.files[inodeIndex].maxFileSize,
			inodeTable: fs.inodeTable,
			inodeIndex
		}

		return fileDescriptor

	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @param {FileAttributes} attributes
	 * @returns {Promise<StatusCode|FileDescriptorIndex>}
	 */
	static async #createFile(fs, filename, attributes) {
		if(EEFS_LIB_IS_WRITE_PROTECTED) { return EEFS_READ_ONLY_FILE_SYSTEM }
		if(fs.inodeTable.numberOfFiles > EEFS_MAX_FILES) { return EEFS_NO_SPACE_LEFT_ON_DEVICE }
		if(EEFS.#hasOpenCreate(fs)) { return EEFS_PERMISSION_DENIED }
		if(fs.inodeTable.freeMemorySize < FILE_HEADER_SIZE) { return EEFS_NO_SPACE_LEFT_ON_DEVICE }
		if((attributes !== EEFS_ATTRIBUTE_NONE) && (attributes !== EEFS_ATTRIBUTE_READONLY)) { return EEFS_INVALID_ARGUMENT }

		const fileDescriptor = EEFS.#getFileDescriptor(fs)
		if(fileDescriptor === EEFS_NO_FREE_FILE_DESCRIPTOR) { return EEFS_NO_FREE_FILE_DESCRIPTOR }

		const inodeIndex = fs.inodeTable.numberOfFiles
		fs.inodeTable.numberOfFiles += 1
		fs.inodeTable.files[inodeIndex] = {
			fileHeaderPointer: fs.inodeTable.freeMemoryPointer,
			maxFileSize: fs.inodeTable.freeMemorySize - FILE_HEADER_SIZE
		}

		const now = Date.now() / 1000 // todo fix me

		const fileHeader = {
			CRC: 0,
			inUse: true,
			attributes,
			fileSize: 0,
			modificationDate: now,
			creationDate: now,
			filename
		}

		await Common.writeFileHeader(fs.eeprom, fs.encoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer, fileHeader)

		fs.fileDescriptorTable[fileDescriptor] = {
			inUse: true,
			mode: EEFS_FCREAT | EEFS_FWRITE,
			fileHeaderPointer: fs.inodeTable.files[inodeIndex].fileHeaderPointer,
			fileDataPointer: fs.inodeTable.files[inodeIndex].fileHeaderPointer + FILE_HEADER_SIZE,
			byteOffset: 0,
			fileSize: 0,
			maxFileSize: fs.inodeTable.files[inodeIndex].maxFileSize,
			inodeTable: fs.inodeTable,
			inodeIndex
		}


		return fileDescriptor
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {FileDescriptorIndex} fileDescriptor
	 * @returns {Promise<StatusCode>}
	 */
	static async close(fs, fileDescriptor) {
		if(!EEFS.#isValidFileDescriptor(fs, fileDescriptor)) { return EEFS_INVALID_ARGUMENT }

		const inodeTable = fs.fileDescriptorTable[fileDescriptor].inodeTable
		const inodeIndex = fs.fileDescriptorTable[fileDescriptor].inodeIndex

		if((fs.fileDescriptorTable[fileDescriptor].mode & EEFS_FCREAT) === EEFS_FCREAT) {
			const maxFileSize = Math.min(
				roundUp(fs.fileDescriptorTable[fileDescriptor].fileSize + EEFS_DEFAULT_CREAT_SPARE_BYTES, 4),
				inodeTable.freeMemorySize - FILE_HEADER_SIZE
			)

			inodeTable.freeMemoryPointer += FILE_HEADER_SIZE + maxFileSize
			inodeTable.freeMemorySize -= FILE_HEADER_SIZE + maxFileSize
			inodeTable.files[inodeIndex].maxFileSize = maxFileSize

			const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, inodeTable.files[inodeIndex].fileHeaderPointer)
			fileHeader.fileSize = fs.fileDescriptorTable[fileDescriptor].fileSize
			fileHeader.CRC = 0
			await Common.writeFileHeader(fs.eeprom, fs.encoder, fs.fileDescriptorTable[fileDescriptor].fileHeaderPointer, fileHeader)

			const fileAllocationTableEntry = {
				fileHeaderOffset: inodeTable.files[inodeIndex].fileHeaderPointer - inodeTable.baseAddress,
				maxFileSize: inodeTable.files[inodeIndex].maxFileSize
			}

			await Common.writeFATEntry(fs.eeprom, inodeTable, inodeIndex, fileAllocationTableEntry)

			const header = await Common.readHeader(fs.eeprom, inodeTable.baseAddress)
			header.freeMemoryOffset = inodeTable.freeMemoryPointer - inodeTable.baseAddress
			header.freeMemorySize = inodeTable.freeMemorySize
			header.numberOfFiles = inodeTable.numberOfFiles

			await Common.writeHeader(fs.eeprom, inodeTable.baseAddress, header)

		}
		else if((fs.fileDescriptorTable[fileDescriptor].mode & EEFS_FWRITE) === EEFS_FWRITE) {

			const now = Date.now() / 1000 // todo fix me

			const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, inodeTable.files[inodeIndex].fileHeaderPointer)
			fileHeader.fileSize = fs.fileDescriptorTable[fileDescriptor].fileSize
			fileHeader.modificationDate = now
			fileHeader.CRC = 0
			await Common.writeFileHeader(fs.eeprom, fs.encoder, fs.fileDescriptorTable[fileDescriptor].fileHeaderPointer, fileHeader )

		}

		EEFS.#freeFileDescriptor(fs, fileDescriptor)
		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {FileDescriptorIndex} fileDescriptor
	 * @param {number} length
	 * @param {AllowSharedBufferSource} target
	 * @returns {Promise<StatusCode|number>}
	 */
	static async read(fs, fileDescriptor, length, target) {
		if(!EEFS.#isValidFileDescriptor(fs, fileDescriptor)) { return EEFS_INVALID_ARGUMENT }
		if(target.byteLength <= 0) { return EEFS_INVALID_ARGUMENT }

		if((fs.fileDescriptorTable[fileDescriptor].mode & EEFS_FREAD) === 0) { return EEFS_PERMISSION_DENIED }

		const bytesToRead = Math.min(fs.fileDescriptorTable[fileDescriptor].fileSize - fs.fileDescriptorTable[fileDescriptor].byteOffset, length)

		const ab = await Common.readData(fs.eeprom, fs.fileDescriptorTable[fileDescriptor].fileDataPointer, length, target)

		fs.fileDescriptorTable[fileDescriptor].byteOffset += bytesToRead
		fs.fileDescriptorTable[fileDescriptor].fileDataPointer += bytesToRead

		return bytesToRead
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {FileDescriptorIndex} fileDescriptor
	 * @param {AllowSharedBufferSource} buffer
	 * @param {number} length
	 * @returns {Promise<StatusCode>}
	 */
	static async write(fs, fileDescriptor, buffer, length) {
		if(!EEFS.#isValidFileDescriptor(fs, fileDescriptor)) { return EEFS_INVALID_ARGUMENT }
		if(buffer.byteLength <= 0) { return EEFS_INVALID_ARGUMENT }
		if(length <= 0) { return EEFS_INVALID_ARGUMENT }

		if((fs.fileDescriptorTable[fileDescriptor].mode & EEFS_FWRITE) === 0) { return EEFS_PERMISSION_DENIED }

		const bytesToWrite = Math.min(fs.fileDescriptorTable[fileDescriptor].maxFileSize - fs.fileDescriptorTable[fileDescriptor].byteOffset, length)

		await Common.writeData(fs.eeprom, fs.fileDescriptorTable[fileDescriptor].fileDataPointer, length, buffer)

		fs.fileDescriptorTable[fileDescriptor].byteOffset += bytesToWrite
		fs.fileDescriptorTable[fileDescriptor].fileDataPointer += bytesToWrite

		if(fs.fileDescriptorTable[fileDescriptor].byteOffset > fs.fileDescriptorTable[fileDescriptor].fileSize) {
			fs.fileDescriptorTable[fileDescriptor].fileSize = fs.fileDescriptorTable[fileDescriptor].byteOffset
		}


		return EEFS_SUCCESS
	}

	static seek() { throw new Error('no impl') }

	static async remove() { throw new Error('no impl') }

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} oldFilename
	 * @param {string} newFilename
	 * @returns {Promise<StatusCode>}
	 */
	static async rename(fs, oldFilename, newFilename) {
		if(!EEFS.#isValidFileName(fs, oldFilename)) { return EEFS_INVALID_ARGUMENT }
		if(!EEFS.#isValidFileName(fs, newFilename)) { return EEFS_INVALID_ARGUMENT }
		if(EEFS_LIB_IS_WRITE_PROTECTED) { return EEFS_READ_ONLY_FILE_SYSTEM }

		const newInodeIndex = await EEFS.#findFile(fs, newFilename)
		if(newInodeIndex !== EEFS_FILE_NOT_FOUND) { return EEFS_PERMISSION_DENIED }

		const oldInodeIndex = await EEFS.#findFile(fs, oldFilename)
		if(oldInodeIndex === EEFS_FILE_NOT_FOUND) { return EEFS_FILE_NOT_FOUND }

		const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.inodeTable.files[oldInodeIndex].fileHeaderPointer)
		if((fileHeader.attributes & EEFS_ATTRIBUTE_READONLY) !== 0) { return EEFS_PERMISSION_DENIED }

		fileHeader.filename = newFilename

		await Common.writeFileHeader(fs.eeprom, fs.encoder, fs.inodeTable.files[oldInodeIndex].fileHeaderPointer, fileHeader)

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @param {Stat} stat
	 * @returns {Promise<StatusCode>}
	 */
	static async stat(fs, filename, stat) {
		if(!EEFS.#isValidFileName(fs, filename)) { return EEFS_INVALID_ARGUMENT }
		const inodeIndex = await EEFS.#findFile(fs, filename)

		const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer)
		stat.inodeIndex = inodeIndex
		stat.CRC = fileHeader.CRC
		stat.attributes = fileHeader.attributes
		stat.fileSize = fileHeader.fileSize
		stat.modificationDate = fileHeader.modificationDate
		stat.creationDate = fileHeader.creationDate
		stat.filename = fileHeader.filename

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {FileDescriptorIndex} fileDescriptor
	 * @param {Stat} stat
	 */
	static async fstat(fs, fileDescriptor, stat) {
		if(!EEFS.#isValidFileDescriptor(fs, fileDescriptor)) { return EEFS_INVALID_ARGUMENT }

		const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.fileDescriptorTable[fileDescriptor].fileHeaderPointer)
		stat.inodeIndex = fs.fileDescriptorTable[fileDescriptor].inodeIndex
		stat.CRC = fileHeader.CRC
		stat.attributes = fileHeader.attributes
		stat.fileSize = fileHeader.fileSize
		stat.modificationDate = fileHeader.modificationDate
		stat.creationDate = fileHeader.creationDate
		stat.filename = fileHeader.filename

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @param {FileAttributes} attributes
	 */
	static async setFileAttributes(fs, filename, attributes) {
		if((attributes !== EEFS_ATTRIBUTE_NONE) && (attributes !== EEFS_ATTRIBUTE_READONLY)) { return EEFS_INVALID_ARGUMENT }
		if(!EEFS.#isValidFileName(fs, filename)) { return EEFS_INVALID_ARGUMENT }
		if(EEFS_LIB_IS_WRITE_PROTECTED) { return EEFS_READ_ONLY_FILE_SYSTEM }

		const inodeIndex = await EEFS.#findFile(fs, filename)
		if(inodeIndex === EEFS_FILE_NOT_FOUND) { return EEFS_FILE_NOT_FOUND }

		const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer)
		fileHeader.attributes = attributes
		await Common.writeFileHeader(fs.eeprom, fs.encoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer, fileHeader)

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @returns {DirectoryDescriptor|undefined}
	 */
	static openDir(fs) {
		if(fs.directoryDescriptor?.inUse === true) { return undefined }

		fs.directoryDescriptor = {
			inUse: true,
			inodeIndex: 0,
			inodeTable: fs.inodeTable
		}

		return fs.directoryDescriptor
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {DirectoryDescriptor} directoryDescriptor
	 * @returns {Promise<DirectoryEntry|undefined>}
	 */
	static async readDir(fs, directoryDescriptor) {
		if(directoryDescriptor.inodeIndex >= directoryDescriptor.inodeTable.numberOfFiles) { return undefined }

		const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, directoryDescriptor.inodeTable.files[directoryDescriptor.inodeIndex].fileHeaderPointer)

		fs.directoryEntry = {
			inodeIndex: directoryDescriptor.inodeIndex,
			filename: fileHeader.filename,
			inUse: fileHeader.inUse,
			fileHeaderPointer: directoryDescriptor.inodeTable.files[directoryDescriptor.inodeIndex].fileHeaderPointer,
			maxFileSize: directoryDescriptor.inodeTable.files[directoryDescriptor.inodeIndex].maxFileSize
		}

		directoryDescriptor.inodeIndex += 1

		return fs.directoryEntry
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {DirectoryDescriptor} directoryDescriptor
	 * @returns {StatusCode}
	 */
	static closeDir(fs, directoryDescriptor) {
		if(directoryDescriptor.inUse === false) { return EEFS_INVALID_ARGUMENT }

		directoryDescriptor.inUse = false
		fs.directoryEntry.inUse = false

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 */
	static hasOpenFiles(fs) {
		for(const fileDescriptor of range(0, EEFS_MAX_OPEN_FILES)) {
			if((fs.fileDescriptorTable[fileDescriptor]?.inUse === true) &&
				(fs.fileDescriptorTable[fileDescriptor].inodeTable === fs.inodeTable)) {
					return true
				}
		}

		return false
	}

	/**
	 * @param {EEFSFileSystem} fs
	 */
	static hasOpenDir(fs) {
		if((fs.directoryDescriptor.inUse === true) && (fs.directoryDescriptor.inodeTable === fs.inodeTable)) {
			return true
		}

		return false
	}

	/**
	 * @param {EEFSFileSystem} fs
	 */
	static #hasOpenCreate(fs) {
		for(const fileDescriptor of range(0, EEFS_MAX_OPEN_FILES)) {
			if((fs.fileDescriptorTable[fileDescriptor]?.inUse === true) &&
				(fs.fileDescriptorTable[fileDescriptor].inodeTable === fs.inodeTable) &&
				((fs.fileDescriptorTable[fileDescriptor].mode & EEFS_FCREAT) !== 0)) {
					return true
				}
		}

		return false
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {number} inodeIndex
	 * @returns {FileDescriptorMode}
	 */
	static #fmode(fs, inodeIndex) {
		return range(0, EEFS_MAX_OPEN_FILES)
			.reduce((mode, fileDescriptor) => {
				if((fs.fileDescriptorTable[fileDescriptor]?.inUse === true) &&
					(fs.fileDescriptorTable[fileDescriptor].inodeTable === fs.inodeTable) &&
					(fs.fileDescriptorTable[fileDescriptor].inodeIndex === inodeIndex)) {
						return mode | fs.fileDescriptorTable[fileDescriptor].mode
					}

				return mode
			}, 0)
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @returns {Promise<StatusCode|number>}
	 */
	static async #findFile(fs, filename) {
		for(const inodeIndex of range(0, fs.inodeTable.numberOfFiles)) {
			if(fs.inodeTable.files[inodeIndex] === undefined) { continue }
			const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer)
			if(!fileHeader.inUse) { continue }
			if(fs.collator.compare(fileHeader.filename, filename) === 0) {
				return inodeIndex
			}
		}

		return EEFS_FILE_NOT_FOUND
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @returns {StatusCode|FileDescriptorIndex}
	 */
	static #getFileDescriptor(fs) {
		for(const fileDescriptor of range(0, EEFS_MAX_OPEN_FILES)) {
			if((fs.fileDescriptorTable[fileDescriptor] === undefined) || (fs.fileDescriptorTable[fileDescriptor].inUse === false)) {
				fs.fileDescriptorTable[fileDescriptor] = {
					inUse: true,
					mode: 0,
					fileHeaderPointer: 0,
					fileDataPointer: 0,
					byteOffset: 0,
					fileSize: 0,
					maxFileSize: 0,
					inodeTable: fs.inodeTable, // todo, unset?
					inodeIndex: 0
				}

				fs.fileDescriptorsInUse += 1

				if(fs.fileDescriptorsInUse > fs.fileDescriptorsHighWaterMark) {
					fs.fileDescriptorsHighWaterMark = fs.fileDescriptorsInUse
				}

				return fileDescriptor
			}
		}

		return EEFS_NO_FREE_FILE_DESCRIPTOR
	}

		/**
	 * @param {EEFSFileSystem} fs
	 * @param {FileDescriptorIndex} fileDescriptor
	 * @returns {StatusCode}
	 */
	static #freeFileDescriptor(fs, fileDescriptor) {
		if(!EEFS.#isValidFileDescriptor(fs, fileDescriptor)) { return EEFS_INVALID_ARGUMENT }

		delete fs.fileDescriptorTable[fileDescriptor]
		fs.fileDescriptorsInUse -= 1

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {FileDescriptorIndex} fileDescriptor
	 * @returns {boolean}
	 */
	static #isValidFileDescriptor(fs, fileDescriptor) {
		if(fileDescriptor < 0) { return false }
		if(fileDescriptor >= EEFS_MAX_OPEN_FILES) { return false }

		return fs.fileDescriptorTable[fileDescriptor]?.inUse ?? false
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {FileDescriptorIndex} fileDescriptor
	 * @returns {FileDescriptor|undefined}
	 */
	static fileDescriptor2Pointer(fs, fileDescriptor) {
		if(!EEFS.#isValidFileDescriptor(fs, fileDescriptor)) { return }
		return fs.fileDescriptorTable[fileDescriptor]
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @returns {boolean}
	 */
	static #isValidFileName(fs, filename) {
		if(filename === undefined) { return false }
		if(typeof filename !== 'string') { return false }

		const filenameBuffer = fs.encoder.encode(filename)
		if(filenameBuffer.byteLength <= 0) { return false }
		if(filenameBuffer.byteLength > EEFS_MAX_FILENAME_SIZE) { return false }

		return true
	}

	static async checkDisk() { throw new Error('no impl') }

	/**
	 * @param {EEFSFileSystem} fs
	 * @returns {FileDescriptorIndex}
	 */
	static getFileDescriptorsInUse(fs) { return fs.fileDescriptorsInUse }

	/**
	 * @param {EEFSFileSystem} fs
	 * @returns {FileDescriptorIndex}
	 */
	static getFileDescriptorsHighWaterMark(fs) { return fs.fileDescriptorsHighWaterMark }

	static getMaxFiles() { return EEFS_MAX_FILES }

	static getMaxOpenFiles() { return EEFS_MAX_OPEN_FILES }

	/**
	 * @param {EEFSFileSystem} fs
	 * @returns {AsyncGenerator<string>}
	 */
	static async *listOpenFiles(fs) {
		for(const fileDescriptor of range(0, EEFS_MAX_OPEN_FILES)) {
			if(fs.fileDescriptorTable[fileDescriptor]?.inUse ?? false) {
				const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.fileDescriptorTable[fileDescriptor].fileHeaderPointer)
				yield fileHeader.filename
			}
		}
	}

	// ----------

	/**
	 * @param {EEFSFileSystem} fs
	 */
	static async *listInodes(fs) {
		for(const inodeIndex of range(0, fs.inodeTable.numberOfFiles)) {
			if(fs.inodeTable.files[inodeIndex] === undefined) { continue }
			const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer)
			if(!fileHeader.inUse) { continue }

			yield {
				inodeIndex,
				filename: fileHeader.filename,
				directory: false
			}
		}
	}
}

