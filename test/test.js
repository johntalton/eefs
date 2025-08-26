

import {
	Common,
	EEFS,
	EEFS_ATTRIBUTE_NONE,
	EEFS_ATTRIBUTE_READONLY,
	EEFS_FILESYS_MAGIC,
	FILE_ALLOCATION_TABLE_HEADER_SIZE,
	FILE_ALLOCATION_TABLE_SIZE,
	O_CREAT,
	O_RDONLY,
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
	console.log('FORMATE =================================', byteSize)
	return Common.writeHeader(fs.eeprom, baseAddress, {
		CRC: 0,
		magic: EEFS_FILESYS_MAGIC,
		version: 1,
		freeMemoryOffset: baseAddress + FILE_ALLOCATION_TABLE_SIZE,
		freeMemorySize: byteSize - FILE_ALLOCATION_TABLE_SIZE,
		numberOfFiles: 0
	})
}

let status = 0
let fd = 0
const stat = {}

await format(filesystem, BASE_ADDRESS, backingBuffer.byteLength)

status = await EEFS.initFS(filesystem, BASE_ADDRESS)
console.log('InitFS', status)


fd = await EEFS.open(filesystem, 'README.temp', O_CREAT|O_WRONLY, EEFS_ATTRIBUTE_NONE)
console.log('open', fd)

for await(const filename of EEFS.listOpenFiles(filesystem)) {
	console.log('>', filename)
}

status = await EEFS.rename(filesystem, 'README.temp', 'README.md')
console.log('rename', status)

for await(const filename of EEFS.listOpenFiles(filesystem)) {
	console.log('>', filename)
}


status = await EEFS.stat(filesystem, 'README.md', stat)
console.log('stat', status, stat, new Date(stat.creationDate * 1000))

console.log('has open', EEFS.hasOpenFiles(filesystem))


const content = filesystem.encoder.encode('# Test\nA simple test')
status = await EEFS.write(filesystem, fd, content, content.byteLength)
console.log('write', status)


status = await EEFS.close(filesystem, fd)
console.log('close', status)

console.log('has open', EEFS.hasOpenFiles(filesystem))

console.log('descriptors used', EEFS.getFileDescriptorsInUse(filesystem))

for await(const filename of EEFS.listOpenFiles(filesystem)) {
	console.log('>', filename)
}

status = await EEFS.setFileAttributes(filesystem, 'README.md', EEFS_ATTRIBUTE_READONLY)
console.log('set attr', status)


status = await EEFS.stat(filesystem, 'README.md', stat)
console.log('stat', status, stat, new Date(stat.creationDate * 1000))

fd = await EEFS.open(filesystem, 'README.md', O_RDONLY, 0)
console.log('re-open', fd)

status = await EEFS.write(filesystem, fd, new ArrayBuffer(1), 1)
console.log('write to readonly', status)

const target = new Uint8Array(stat.fileSize)
status = await EEFS.read(filesystem, fd, stat.fileSize, target)
console.log('read', status, target)
console.log(filesystem.decoder.decode(target))

status = await EEFS.close(filesystem, fd)
console.log('re-close', status)



fd = await EEFS.create(filesystem, '.gitignore', EEFS_ATTRIBUTE_NONE)
console.log('new file', fd)

status = await EEFS.stat(filesystem, '.gitignore', stat)
console.log('stat second file', status, stat, new Date(stat.creationDate * 1000))

status = await EEFS.close(filesystem, fd)
console.log('close second file', status)

status = EEFS.freeFS(filesystem)
console.log('end of line', status)






function isDuplicateFileName() {}

function addFile() {


}


console.log(backingBuffer)