import { Common } from './common.js'
import {
	EEFS_ATTRIBUTE_NONE,
	EEFS_ATTRIBUTE_READONLY,
	EEFS_DEFAULT_CREATE_SPARE_BYTES,
	EEFS_DEVICE_IS_BUSY,
	EEFS_FCREAT,
	EEFS_FILE_NOT_FOUND,
	EEFS_FILESYSTEM_MAGIC,
	EEFS_FILESYSTEM_VERSION,
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
	O_WRONLY,
	SEEK_CUR,
	SEEK_END,
	SEEK_SET
} from './defs.js'

import {
	FILE_ALLOCATION_TABLE_ENTRY_SIZE,
	FILE_ALLOCATION_TABLE_HEADER_SIZE,
	FILE_HEADER_SIZE
} from './types.js'

import { range, modeFromFlags, roundUp } from './utils.js'

/**
 * @import {
 *  EEFSFileSystemOptions,
 *  EEFSFileSystemWithStatus,
 *  StatusError,
 *  EEFSFileSystem,
 *  FileSystemFlags,
 *  StatusCode,
 *  InodeIndex,
 *  FileDescriptorIndex,
 *  FileDescriptorMode,
 *  FileAttributes,
 *  Stat,
 *  SeekOrigin
 * } from './types.js'
 */

export class EEFS {
	/**
	 * @param {EEFSFileSystemOptions} options
	 * @param {number} baseAddress
	 * @returns {Promise<EEFSFileSystemWithStatus|StatusError>}
	 */
	static async initFS(options, baseAddress) {
		const { eeprom } = options
		if(eeprom === undefined) { return { status: EEFS_NO_SUCH_DEVICE, why: 'invalid device' } }

		const collator = options?.collator ?? new Intl.Collator()
		const encoder = options?.encoder ?? new TextEncoder()
		const decoder = options?.decoder ?? new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })

		const header = await Common.readHeader(eeprom, baseAddress)

		if(header.magic !== EEFS_FILESYSTEM_MAGIC) { return { status: EEFS_NO_SUCH_DEVICE, why: 'bad magic' } }
		if(header.version !== EEFS_FILESYSTEM_VERSION) { return { status: EEFS_NO_SUCH_DEVICE, why: 'bad version' } }
		if(header.numberOfFiles > EEFS_MAX_FILES) { return { status: EEFS_NO_SUCH_DEVICE, why: 'max files' } }

		const files = new Array(header.numberOfFiles)
		for(const inodeIndex of range(0, header.numberOfFiles - 1)) {
			const fatEntry = await Common.readFATEntry(eeprom, baseAddress + FILE_ALLOCATION_TABLE_HEADER_SIZE + (inodeIndex * FILE_ALLOCATION_TABLE_ENTRY_SIZE))
			files[inodeIndex] = {
				fileHeaderPointer: baseAddress + fatEntry.fileHeaderOffset,
				maxFileSize: fatEntry.maxFileSize
			}
		}

		return {
			eeprom,
			collator,
			encoder,
			decoder,

			status: EEFS_SUCCESS,

			inodeTable: {
				baseAddress,
				freeMemoryPointer: baseAddress + header.freeMemoryOffset,
				freeMemorySize: header.freeMemorySize,
				numberOfFiles: header.numberOfFiles,
				files
			},
			fileDescriptorTable: [],
			fileDescriptorsInUse: 0,
			fileDescriptorsHighWaterMark: 0
		}
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @returns {StatusCode}
	 */
	static freeFS(fs) {
		if(EEFS.hasOpenFiles(fs)) { return EEFS_DEVICE_IS_BUSY }

		fs.inodeTable.baseAddress = 0
		fs.inodeTable.freeMemoryPointer = 0
		fs.inodeTable.freeMemorySize = 0
		fs.inodeTable.numberOfFiles = 0
		fs.inodeTable.files = []

		fs.fileDescriptorTable = []
		fs.fileDescriptorsInUse = 0
		fs.fileDescriptorsHighWaterMark = 0

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @param {FileSystemFlags} flags
	 * @param {FileAttributes} [attributes = EEFS_ATTRIBUTE_NONE]
	 * @returns {Promise<StatusCode|FileDescriptorIndex>}
	 */
	static async open(fs, filename, flags, attributes = EEFS_ATTRIBUTE_NONE) {
		if(!EEFS.#isValidFileName(fs, filename)){ return EEFS_INVALID_ARGUMENT }

		const inodeIndex = await EEFS.#findFile(fs, filename)
		if(inodeIndex !== EEFS_FILE_NOT_FOUND) {
			return EEFS.#openFile(fs, inodeIndex, flags, attributes)
		}
		else if((flags & O_CREAT) !== 0) {
			return EEFS.#createFile(fs, filename, EEFS_ATTRIBUTE_NONE)
		}

		return EEFS_FILE_NOT_FOUND
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @param {FileAttributes} [attributes = EEFS_ATTRIBUTE_NONE]
	 * @returns {Promise<StatusCode|FileDescriptorIndex>}
	 */
	static async create(fs, filename, attributes = EEFS_ATTRIBUTE_NONE) {
		if(!EEFS.#isValidFileName(fs, filename)) { return EEFS_INVALID_ARGUMENT }

		const inodeIndex = await EEFS.#findFile(fs, filename)
		if(inodeIndex !== EEFS_FILE_NOT_FOUND) {
			return EEFS.#openFile(fs, inodeIndex, (O_WRONLY | O_TRUNC), attributes)
		}

		return EEFS.#createFile(fs, filename, attributes)
	}

	/**
	* @param {EEFSFileSystem} fs
	 * @param {InodeIndex} inodeIndex
	 * @param {FileSystemFlags} flags
	 * @param {FileAttributes} attributes
	 * @returns {Promise<StatusCode|FileDescriptorIndex>}
	 */
	static async #openFile(fs, inodeIndex, flags, attributes) {
		const openingReadonly = (flags & O_ACCMODE) === O_RDONLY

		if((flags & ~(O_RDONLY | O_WRONLY | O_RDWR | O_TRUNC | O_CREAT)) !== 0) { return EEFS_INVALID_ARGUMENT }
		if(!openingReadonly && EEFS_LIB_IS_WRITE_PROTECTED) { return EEFS_READ_ONLY_FILE_SYSTEM }

		const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer)
		if(!openingReadonly && ((fileHeader.attributes & EEFS_ATTRIBUTE_READONLY) !== 0)) { return EEFS_PERMISSION_DENIED }

		const fMode = EEFS.#fMode(fs, inodeIndex)
		if(!openingReadonly && ((fMode & EEFS_FWRITE) !== 0)) { return EEFS_PERMISSION_DENIED }

		const fileDescriptor = EEFS.#getFileDescriptor(fs)
		if(fileDescriptor === EEFS_NO_FREE_FILE_DESCRIPTOR) { return EEFS_NO_FREE_FILE_DESCRIPTOR }

		const openingWriteOnly = (flags & O_ACCMODE) == O_WRONLY
		const openingReadWrite = (flags & O_ACCMODE) == O_RDWR
		const truncate = (openingWriteOnly || openingReadWrite) && ((flags & O_TRUNC) !== 0)

		fs.fileDescriptorTable[fileDescriptor] = {
			inUse: true,
			mode: modeFromFlags(flags),
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
				roundUp(fs.fileDescriptorTable[fileDescriptor].fileSize + EEFS_DEFAULT_CREATE_SPARE_BYTES, 4),
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

			await Common.writeFATEntry(fs.eeprom, inodeTable.baseAddress + FILE_ALLOCATION_TABLE_HEADER_SIZE + (inodeIndex * FILE_ALLOCATION_TABLE_ENTRY_SIZE), fileAllocationTableEntry)

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
		if(length <= 0) { return EEFS_INVALID_ARGUMENT }
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

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {FileDescriptorIndex} fileDescriptor
	 * @param {number} byteOffset
	 * @param {SeekOrigin} origin
	 */
	static seek(fs, fileDescriptor, byteOffset, origin) {
		if(!EEFS.#isValidFileDescriptor(fs, fileDescriptor)) { return EEFS_INVALID_ARGUMENT}

		const beginningOfFilePointer = fs.fileDescriptorTable[fileDescriptor].fileHeaderPointer + FILE_HEADER_SIZE
		const endOfFilePointer = beginningOfFilePointer + fs.fileDescriptorTable[fileDescriptor].fileSize

		if(origin === SEEK_SET) {
			if(byteOffset > endOfFilePointer) { return EEFS_INVALID_ARGUMENT }

			if(byteOffset > fs.fileDescriptorTable[fileDescriptor].fileSize) {
				fs.fileDescriptorTable[fileDescriptor].fileDataPointer = endOfFilePointer
				fs.fileDescriptorTable[fileDescriptor].byteOffset = fs.fileDescriptorTable[fileDescriptor].fileSize
				return fs.fileDescriptorTable[fileDescriptor].byteOffset
			}

			fs.fileDescriptorTable[fileDescriptor].fileDataPointer = beginningOfFilePointer + byteOffset
			fs.fileDescriptorTable[fileDescriptor].byteOffset = byteOffset
			return fs.fileDescriptorTable[fileDescriptor].byteOffset
		}
		else if(origin === SEEK_CUR) {
			if((fs.fileDescriptorTable[fileDescriptor].byteOffset + byteOffset) < 0) { return EEFS_INVALID_ARGUMENT }

			if((fs.fileDescriptorTable[fileDescriptor].byteOffset + byteOffset) > fs.fileDescriptorTable[fileDescriptor].fileSize) {
				fs.fileDescriptorTable[fileDescriptor].fileDataPointer = endOfFilePointer
				fs.fileDescriptorTable[fileDescriptor].byteOffset = fs.fileDescriptorTable[fileDescriptor].fileSize
				return fs.fileDescriptorTable[fileDescriptor].byteOffset
			}

			fs.fileDescriptorTable[fileDescriptor].fileDataPointer += byteOffset
			fs.fileDescriptorTable[fileDescriptor].byteOffset += byteOffset
			return fs.fileDescriptorTable[fileDescriptor].byteOffset
		}
		else if(origin === SEEK_END) {
			if((fs.fileDescriptorTable[fileDescriptor].fileSize + byteOffset) < 0) { return EEFS_INVALID_ARGUMENT }

			if(byteOffset > 0) {
				fs.fileDescriptorTable[fileDescriptor].fileDataPointer = endOfFilePointer
				fs.fileDescriptorTable[fileDescriptor].byteOffset = fs.fileDescriptorTable[fileDescriptor].fileSize
				return fs.fileDescriptorTable[fileDescriptor].byteOffset
			}

			fs.fileDescriptorTable[fileDescriptor].fileDataPointer = endOfFilePointer + byteOffset
			fs.fileDescriptorTable[fileDescriptor].byteOffset = fs.fileDescriptorTable[fileDescriptor].fileSize + byteOffset
			return fs.fileDescriptorTable[fileDescriptor].byteOffset
		}

		// unknown seek origin
		return EEFS_INVALID_ARGUMENT
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @returns {Promise<StatusCode>}
	 */
	static async remove(fs, filename) {
		if(!EEFS.#isValidFileName(fs, filename)) { return EEFS_INVALID_ARGUMENT }
		if(EEFS_LIB_IS_WRITE_PROTECTED) { return EEFS_READ_ONLY_FILE_SYSTEM }

		const inodeIndex = await EEFS.#findFile(fs, filename)
		if(inodeIndex === EEFS_FILE_NOT_FOUND) { return EEFS_FILE_NOT_FOUND }

		const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer)
		if((fileHeader.attributes & EEFS_ATTRIBUTE_READONLY) !== 0) { return EEFS_PERMISSION_DENIED }

		if(EEFS.#fMode(fs, inodeIndex) !== 0) { return EEFS_PERMISSION_DENIED }

		const now = Date.now() / 1000 // todo fix me
		fileHeader.inUse = false
		fileHeader.modificationDate = now

		await Common.writeFileHeader(fs.eeprom, fs.encoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer, fileHeader)

		return EEFS_SUCCESS
	}

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

		const now = Date.now() / 1000 // todo fix me
		fileHeader.filename = newFilename
		fileHeader.modificationDate = now

		await Common.writeFileHeader(fs.eeprom, fs.encoder, fs.inodeTable.files[oldInodeIndex].fileHeaderPointer, fileHeader)

		return EEFS_SUCCESS
	}

	/**
	 * @param {EEFSFileSystem} fs
	 * @param {string} filename
	 * @param {Partial<Stat>} stat
	 * @returns {Promise<StatusCode>}
	 */
	static async stat(fs, filename, stat) {
		if(!EEFS.#isValidFileName(fs, filename)) { return EEFS_INVALID_ARGUMENT }
		const inodeIndex = await EEFS.#findFile(fs, filename)
		if(inodeIndex === EEFS_FILE_NOT_FOUND) { return EEFS_FILE_NOT_FOUND }

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
	 * @param {Partial<Stat>} stat
	 * @returns {Promise<StatusCode>}
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
	 * @returns {Promise<StatusCode>}
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
	 */
	static hasOpenFiles(fs) {
		for(const fileDescriptor of range(0, EEFS_MAX_OPEN_FILES - 1)) {
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
	static #hasOpenCreate(fs) {
		for(const fileDescriptor of range(0, EEFS_MAX_OPEN_FILES - 1)) {
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
	 * @param {InodeIndex} inodeIndex
	 * @returns {FileDescriptorMode}
	 */
	static #fMode(fs, inodeIndex) {
		return range(0, EEFS_MAX_OPEN_FILES - 1)
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
	 * @returns {Promise<StatusCode|InodeIndex>}
	 */
	static async #findFile(fs, filename) {
		for(const inodeIndex of range(0, fs.inodeTable.numberOfFiles - 1)) {
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
		for(const fileDescriptor of range(0, EEFS_MAX_OPEN_FILES - 1)) {
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
		for(const fileDescriptor of range(0, EEFS_MAX_OPEN_FILES - 1)) {
			if(fs.fileDescriptorTable[fileDescriptor]?.inUse ?? false) {
				const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.fileDescriptorTable[fileDescriptor].fileHeaderPointer)
				yield fileHeader.filename
			}
		}
	}

	/**
	 * @param {EEFSFileSystem} fs
	 */
	static async *listInodes(fs) {
		for(const inodeIndex of range(0, fs.inodeTable.numberOfFiles - 1)) {
			if(fs.inodeTable.files[inodeIndex] === undefined) { continue }
			const fileHeader = await Common.readFileHeader(fs.eeprom, fs.decoder, fs.inodeTable.files[inodeIndex].fileHeaderPointer)
			if(!fileHeader.inUse) { continue }

			yield {
				inodeIndex,
				filename: fileHeader.filename,
				fileSize: fileHeader.fileSize,
				directory: false
			}
		}
	}
}

