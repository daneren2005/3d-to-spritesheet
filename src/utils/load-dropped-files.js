export default async function loadDroppedFiles(event) {
	if(event.dataTransfer.items && event.dataTransfer.items.length && event.dataTransfer.items[0].webkitGetAsEntry) {
		let entries = Array.from(event.dataTransfer.items).map(item => item.webkitGetAsEntry());
		return await recursivelyReadFilesFromDataTransfer(entries);
	} else {
		return [...event.dataTransfer.files];
	}
}

async function recursivelyReadFilesFromDataTransfer(entries) {
	let files = [];
	for(let i = 0; i < entries.length; i++) {
		let entry = entries[i];
		if(!entry) {
			continue;
		}

		if(entry.isFile) {
			files.push(await getFileFromEntry(entry));
		} else if(entry.isDirectory) {
			let reader = entry.createReader();
			let entries = await readFilesFromReader(reader);
			while(entries.length > 0) {
				files.push(...await recursivelyReadFilesFromDataTransfer(entries));
				entries = await readFilesFromReader(reader);
			}
		}
	}

	return files;
}
async function readFilesFromReader(reader) {
	return await new Promise((resolve, reject) => {
		reader.readEntries(resolve, reject);
	});
}
async function getFileFromEntry(entry) {
	return new Promise((resolve, reject) => {
		entry.file((file) => resolve(file), (error) => reject(error));
	});
}