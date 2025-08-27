import { EEFS, EEFS_ATTRIBUTE_NONE, EEFS_ATTRIBUTE_READONLY, O_CREAT, O_WRONLY, format } from '@johntalton/eefs'
import { EEFSStorageManager } from '@johntalton/eefs/storage'
import { EEPROMArrayBuffer } from '@johntalton/eefs/eeprom-array-buffer'

const delayMS = ms => new Promise(resolve => setTimeout(() => resolve(true), ms))

//
const byteSize = 32 * 1024 / 8
const eeprom = new EEPROMArrayBuffer(new ArrayBuffer(byteSize))

const baseAddress = 32
//
console.log('=========== Format =============', byteSize)
await format(eeprom, baseAddress, byteSize)

//
const storage = await EEFSStorageManager.from(eeprom, { baseAddress })

// ---------
{
	const fd = await EEFS.open(storage.filesystem, 'README.md', O_CREAT | O_WRONLY, EEFS_ATTRIBUTE_NONE)
	const lines = [
		'# EEFS',
		'A NASA EEFS implementation in javascript',
		'## Features',
		'Stuff goes here...'
	]
	for(const line of lines) {
		const content = storage.filesystem.encoder.encode(line + '\n')
		const status = await EEFS.write(storage.filesystem, fd, content, content.byteLength)
	}
	await EEFS.close(storage.filesystem, fd)
}
// ---------
// await delayMS(1000 * 2)
// ---------
{
	const fd = await EEFS.open(storage.filesystem, 'config.json', O_CREAT | O_WRONLY, EEFS_ATTRIBUTE_NONE)
	const content = storage.filesystem.encoder.encode(JSON.stringify({
		name: 'foo',
		increment: 2,
		device: null,
		days: [ 'monday', 'friday', 'saturday' ]
	}, null, 2))
	const status = await EEFS.write(storage.filesystem, fd, content, content.byteLength)
	await EEFS.close(storage.filesystem, fd)
}
// ---------
// ---------
{
	const fd = await EEFS.open(storage.filesystem, '👩🏻‍❤️‍💋‍👩🏼.txt', O_CREAT | O_WRONLY, EEFS_ATTRIBUTE_NONE)
	const content = storage.filesystem.encoder.encode('敏捷的棕色狐狸跳过了懒惰睡觉的狗\r\nقفز الثعلب البني السريع فوق الكلب النائم الكسول')
	const status = await EEFS.write(storage.filesystem, fd, content, content.byteLength)
	await EEFS.close(storage.filesystem, fd)
}
// ---------


const root = await storage.getDirectory()

const handle = await root.getFileHandle('👩🏻‍❤️‍💋‍👩🏼.txt', { create: false })
console.log(`file 👩🏻‍❤️‍💋‍👩🏼.txt ${handle }`)


const newHandle = await root.getFileHandle('💾 save me', { create: true })
const writable = await newHandle.createWritable({ })
const writer = writable.getWriter()
await writer.write(storage.filesystem.encoder.encode('<b>Save Me</b>'))
await writer.close()
writer.releaseLock()






for await (const [name, handle] of root) {

	if (handle.kind === 'file') {
		const file = await handle.getFile()
		console.log(`${root.name}${file.name}`)
		console.log(`\tlastModified: ${new Date(file.lastModified)}`)
		console.log(`\tbyteSize: ${file.size}`)
		console.log(`\t${(await file.text()).replaceAll('\n', '\n\t')}`)
	}
	else if (handle.kind === 'directory') {

	}
}


