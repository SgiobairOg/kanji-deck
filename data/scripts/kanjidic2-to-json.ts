import { join } from "path";
import { createReadStream, createWriteStream } from "fs";
import { createStream } from "sax";
import { randomUUID } from "crypto";

type Reading = Record<string, string[]>

interface CharData {
    _id?: string;
    literal?: string,
    grade?: string,
    freq?: string,
    readings?: Reading,
    meanings?: string[]

}

const ROOT_DIR = __dirname;
const DATA_DIR = join(ROOT_DIR, '..', 'raw');
const PROCESSED_DIR = join(ROOT_DIR, '..', 'processed');

const RAW_DATA = join(DATA_DIR, 'kanjidic2.xml');

const NODE_KEYS = ['literal', 'grade', 'freq'];
const READING_KEYS = ['ja_on', 'ja_kun']

const stream = createReadStream(RAW_DATA);
const xmlParser = createStream(true);

const counts = {
    all: 0,
    elementary: 0,
    gradeOne: 0
}

const allKanji = createWriteStream(join(PROCESSED_DIR, `kanjidic-all.json`));
const elementaryKanji = createWriteStream(join(PROCESSED_DIR, `kanjidic-elementary.json`));
const gradeOneKanji = createWriteStream(join(PROCESSED_DIR, `kanjidic-grade-one.json`));

let currentCharData: CharData = {};
let currentNodeName: string | undefined = undefined;
let currentRType: string | undefined = undefined;
let currentLang: string | undefined = undefined;

xmlParser.on('error', (e) => console.error(e));

xmlParser.on('opentag', (node) => {
    if( node.name === 'character') {
        currentCharData = { _id: randomUUID(), readings: {}, meanings: [] }

        for( let key of READING_KEYS ) {
            currentCharData.readings[key] = []
        }
    }

    currentRType = node.attributes['r_type']
    currentLang = node.attributes['m_lang']

    currentNodeName = node.name
});

xmlParser.on('text', (text) => {
    if(!text.trim()) { return }

    if( currentNodeName === 'meaning' && currentLang === undefined) {
        currentCharData.meanings.push(text)
    }

    if( currentNodeName === 'reading' && READING_KEYS.includes(currentRType)) {
        currentCharData.readings[currentRType].push(text)
    }

    if( NODE_KEYS.includes(currentNodeName) ) {
        currentCharData[currentNodeName] = text
    }
});

xmlParser.on('closetag', (node) => {
    if(node !== 'character') return

    const charJSON = JSON.stringify(currentCharData)

    allKanji.write(`${counts.all === 0 ? '' : ','}${charJSON}`)
    counts.all += 1

    if(currentCharData.grade === '1') {
        gradeOneKanji.write(`${counts.gradeOne === 0 ? '' : ','}${charJSON}`)
        counts.gradeOne += 1
        elementaryKanji.write(`${counts.elementary === 0 ? '' : ','}${charJSON}`)
        counts.elementary += 1
    }

    currentCharData = {}
    currentNodeName = undefined
});

xmlParser.on('end', () => {
    allKanji.write(`], "count": ${counts.all} }`);
    elementaryKanji.write(`], "count": ${counts.elementary} }`);
    gradeOneKanji.write(`], "count": ${counts.gradeOne} }`)

    allKanji.close()
    elementaryKanji.close()
    gradeOneKanji.close()

    console.info("All nodes processed:")
    console.info({
        "All Kanji": counts.all,
        "Elementary Kanji": counts.elementary,
        "Grade 1 Kanji": counts.gradeOne
    })

})

allKanji.write('{"characters": [');
elementaryKanji.write('{"characters": [');
gradeOneKanji.write('{"characters":[')

stream.pipe(xmlParser);
