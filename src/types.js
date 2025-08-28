import { EEFS_MAX_FILENAME_SIZE, EEFS_MAX_FILES } from './defs.js'

export const BIT_32_SIZE = 4
export const TIME_SIZE = BIT_32_SIZE
/**
 * @typedef {number} Time
 */

export const FILE_ALLOCATION_TABLE_HEADER_SIZE = 6 * BIT_32_SIZE
export const FILE_ALLOCATION_TABLE_ENTRY_SIZE = 2 * BIT_32_SIZE
export const FILE_ALLOCATION_TABLE_SIZE = FILE_ALLOCATION_TABLE_HEADER_SIZE + (FILE_ALLOCATION_TABLE_ENTRY_SIZE * EEFS_MAX_FILES)
export const FILE_HEADER_SIZE = (4 * BIT_32_SIZE) + (2 * TIME_SIZE) + EEFS_MAX_FILENAME_SIZE

export const INUSE = {
	TRUE: 1,
	FALSE: 0
}

/**
 * @typedef {Object} EEPROM
 * @property {(offset: number, length: number, target?: AllowSharedBufferSource) => Promise<AllowSharedBufferSource>} read
 * @property {(offset: number, buffer: AllowSharedBufferSource) => Promise<void>} write
 */

/**
 * @typedef {Object} EEFSFileSystem
 * @property {EEPROM} eeprom
 * @property {InodeTable} inodeTable
 * @property {FileDescriptorTable} fileDescriptorTable
 * @property {number} fileDescriptorsInUse
 * @property {number} fileDescriptorsHighWaterMark
 * @property {Intl.Collator} collator
 * @property {TextEncoder} encoder
 * @property {TextDecoder} decoder
 *
 * removed directoryDescriptor and directoryEntry
 */



/**
 * @typedef {number} StatusCode
 */

/**
 * @typedef {number} FileSystemFlags
 */

/**
 * @typedef {number} FileDescriptorIndex
 */

/**
 * @typedef {number} InodeIndex
 */



/**
 * @typedef {Object} Header
 * @property {number} CRC
 * @property {number} magic
 * @property {number} version
 * @property {number} freeMemoryOffset
 * @property {number} freeMemorySize
 * @property {number} numberOfFiles
 */

/**
 * @typedef {Object} FileAllocationTableEntry
 * @property {number} fileHeaderOffset
 * @property {number} maxFileSize
 */

/**
 * @typedef {Object} FileAllocationTable
 * @property {Header} header
 * @property {Array<FileAllocationTableEntry>} files
 */

/** @typedef {number} FileAttributes */

/**
 * @typedef {Object} FileHeader
 * @property {number} CRC
 * @property {boolean} inUse
 * @property {FileAttributes} attributes
 * @property {number} fileSize
 * @property {Time} modificationDate
 * @property {Time} creationDate
 * @property {string} filename
 */

/**
 * @typedef {Object} InodeTableEntry
 * @property {number} fileHeaderPointer
 * @property {number} maxFileSize
 */

/**
 * @typedef {Object} InodeTable
 * @property {number} baseAddress
 * @property {number} freeMemoryPointer
 * @property {number} freeMemorySize
 * @property {number} numberOfFiles
 * @property {Array<InodeTableEntry>} files
 */


/**
 * @typedef {number} FileDescriptorMode
 */

/**
 * @typedef {Object} FileDescriptor
 * @property {boolean} inUse;
 * @property {FileDescriptorMode} mode;
 * @property {number} fileHeaderPointer;
 * @property {number} fileDataPointer;
 * @property {number} byteOffset;
 * @property {number} fileSize;
 * @property {number} maxFileSize;
 * @property {InodeTable} inodeTable;
 * @property {InodeIndex} inodeIndex;
 */


/**
 * @typedef {Array<FileDescriptor>} FileDescriptorTable
 */

/**
 * @typedef {Object} _DirectoryDescriptor
 * @property {boolean} inUse
 * @property {InodeIndex} inodeIndex
 * @property {InodeTable} inodeTable
 */

/**
 * @typedef {Object} _DirectoryEntry
 * @property {InodeIndex} inodeIndex
 * @property {string} filename
 * @property {boolean} inUse
 * @property {number} fileHeaderPointer
 * @property {number} maxFileSize
 */

/**
 * @typedef {Object} Stat
 * @property {InodeIndex} inodeIndex
 * @property {number} CRC
 * @property {FileAttributes} attributes
 * @property {number} fileSize
 * @property {Time} modificationDate
 * @property {Time} creationDate
 * @property {string} filename
 */