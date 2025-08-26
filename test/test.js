

import {
	Common,
	EEFS,
	EEFS_ATTRIBUTE_NONE,
	EEFS_FILESYS_MAGIC,
	FILE_ALLOCATION_TABLE_HEADER_SIZE,
	O_CREAT,
	O_WRONLY
} from '@johntalton/eefs'

import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'

const backingBuffer = new ArrayBuffer(32 * 1024 / 8)
const BASE_ADDRESS = 0
const filesystem = {
	eeprom: new EEPROMArrayBuffer(backingBuffer),
	inodeTable: {
		baseAddress: BASE_ADDRESS,
		freeMemoryPointer: 0,
		freeMemorySize: 0,
		numberOfFiles: 0,
		files: []
	},
	fileDescriptorTable: [],
	fileDescriptorsInUse: 0,
	fileDescriptorsHighWaterMark: 0,
	directoryDescriptor: {
		// inUse: false,
		// inodeIndex: 0,
		// inodeTable: undefined
	},
	directoryEntry: {
		// inodeIndex: 0,
		// filename: undefined,
		// inUse: false,
		// fileHeaderPointer: 0,
		// maxFileSize: 0
	},
	collator: new Intl.Collator(),
	encoder: new TextEncoder(),
	decoder: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
}



async function format(fs, baseAddress, byteSize) {
	return Common.writeHeader(fs.eeprom, baseAddress, {
		CRC: 0,
		magic: EEFS_FILESYS_MAGIC,
		version: 1,
		freeMemoryOffset: baseAddress + FILE_ALLOCATION_TABLE_HEADER_SIZE,
		freeMemorySize: byteSize - FILE_ALLOCATION_TABLE_HEADER_SIZE,
		numberOfFiles: 0
	})
}

let status = 0

await format(filesystem, BASE_ADDRESS, backingBuffer.byteLength)

status = await EEFS.initFS(filesystem, BASE_ADDRESS)
console.log('InitFS', status)


const fd = await EEFS.open(filesystem, 'README.temp', O_CREAT|O_WRONLY, EEFS_ATTRIBUTE_NONE)
console.log('open', fd)

for await(const filename of EEFS.listOpenFiles(filesystem)) {
	console.log('>', filename)
}

status = await EEFS.rename(filesystem, 'README.temp', 'README.md')
console.log('rename', status)

for await(const filename of EEFS.listOpenFiles(filesystem)) {
	console.log('>', filename)
}

const stat = {}
status = await EEFS.stat(filesystem, 'README.md', stat)
console.log('stat', status, stat, new Date(stat.creationDate))

status = await EEFS.close(filesystem, fd)
console.log('close', status)


function isDuplicateFileName() {}

function addFile() {


}


console.log(backingBuffer)