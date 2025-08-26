import { EEFS, EEFS_ATTRIBUTE_NONE, EEFS_ATTRIBUTE_READONLY, O_CREAT, O_WRONLY } from '@johntalton/eefs'
import { EEFSStorageManager } from '@johntalton/eefs/storage'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'
import { format } from './format.js'

const delayMS = ms => new Promise(resolve => setTimeout(() => resolve(true), ms))

//
const byteSize = 32 * 1024 / 8
const eeprom = new EEPROMArrayBuffer(new ArrayBuffer(byteSize))

//
await format(eeprom, 0, byteSize)

//
const storage = await EEFSStorageManager.from(eeprom)

// ---------
{
	const fd = await EEFS.open(storage.filesystem, 'README.md', O_CREAT | O_WRONLY, EEFS_ATTRIBUTE_NONE)
	const content = storage.filesystem.encoder.encode('# Test\nA simple test')
	const status = await EEFS.write(storage.filesystem, fd, content, content.byteLength)
	await EEFS.close(storage.filesystem, fd)
}
// ---------
await delayMS(1000 * 2)
// ---------
{
	const fd = await EEFS.open(storage.filesystem, 'config.json', O_CREAT | O_WRONLY, EEFS_ATTRIBUTE_NONE)
	const content = storage.filesystem.encoder.encode(JSON.stringify({
		name: 'foo',
		increment: 2,
		device: null,
		days: [ 'monday', 'friday', 'saturday' ]
	}))
	const status = await EEFS.write(storage.filesystem, fd, content, content.byteLength)
	await EEFS.close(storage.filesystem, fd)
}
// ---------


const root = await storage.getDirectory()
for await (const [name, handle] of root) {

	if (handle.kind === 'file') {
		const file = await handle.getFile()
		console.log(`${root.name}${file.name}`)
		console.log(`\tlastModified: ${new Date(file.lastModified)}`)
		console.log(`\tbyteSize: ${file.size}`)
		console.log(`\t${(await file.text()).replaceAll('\n', '')}`)
	}
	else if (handle.kind === 'directory') {

	}
}
