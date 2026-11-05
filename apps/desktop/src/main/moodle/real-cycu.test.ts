/**
 * Regression coverage for moodle real-cycu.
 * Owned by main/moodle.
 * Tests own their fixtures and cleanup; live prerequisites must remain explicit.
 * @packageDocumentation
 */
import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseCourseIdentity,courseLifecycle,applyAuthoritativeTeachers} from './identity';
const rows = readFileSync(new URL('./fixtures/real-cycu-courses.tsv',import.meta.url),'utf8').trimEnd().split('\n').map(row => row.split('\t'));
const expected = [
 ["全球化大議題", "Big Issues of Globalization", "林能山", "LIN, NENG-SHAN", "基礎必修通識", "GQB", "1151", "GQ396C"],
 ["桌球(男.女)二", "Table Tennis (M.F) II", "林建豪", "LIN, CHIEN- HAO", "體育興趣", "GRB", "1151", "GR502A"],
 ["全民國防教育軍事訓練課程-防衛動員", "Military Education of National Defense - Defense Mobilization", "王浩成", "WANG HAO-CHENG", "軍訓(日)", "MNB", "1151", "MN041C"],
 ["人生哲學", "Philosophy of Life", "韓邦福", "HAN, PANG-FU", "基礎必修通識", "GQB", "1151", "GQ201I"],
 ["倫理與現代生活(遠距)", "Ethics and Modern Life(distance)", "黃信二", "HUANG, HSIN-ER", "延伸選修通識", "GEB", "1151", "GE280B"],
 ["工程倫理", "Engineering Ethics", "", "", "延伸選修通識", "GEB", "1151", "GE488G"],
 ["專題研究(一)", "Special Research Topic (I)", "", "", "資訊三甲", "CSB", "1151", "CS336G"],
 ["機率與統計(一)", "Probability & Statistics (1)", "蘇志文", "SU,CHIH-WEN", "資訊三乙", "CSB", "1151", "CS313H"],
 ["計算機系統", "Computer Systems", "", "", "資訊三乙", "CSB", "1151", "CS305H"],
 ["計算機網路", "Computer Networks", "楊明豪", "YANG MING-HOUR", "資訊三乙", "CSB", "1151", "CS283H"],
 ["作業系統", "Operating Systems", "鍾武君", "WU-CHUN CHUNG", "資訊三乙", "CSB", "1151", "CS267H"],
 ["中原大學就業學程簡介", "", "", "", "", "", "1142", ""],
 ["爵士樂賞析(遠距)", "The Beauty of Jazz(distance)", "楊曉恩", "Shawna Yang", "延伸選修通識", "GEB", "1142", "GE947A"],
 ["桌球(男.女)一", "Table Tennis (Ping_Pong) (M.F) I", "陳仕杰", "CHEN, CHIN-JUNG", "體育興趣", "GRB", "1142", "GR184K"],
 ["電子電路實驗", "Electronics Laboratory", "湯松年", "TANG, SONG-NIEN", "資訊二乙", "CSB", "1142", "CS924E"],
 ["物件導向程式設計", "Object Oriented Programming", "莊啓宏", "CHUANG, CHI-HUNG", "資訊二乙", "CSB", "1142", "CS515E"],
 ["電子學", "Electronic", "鄭維凱", "CHENG, WEI KAI", "資訊二乙", "CSB", "1142", "CS397E"],
 ["計算機組織", "Computer Organization", "朱守禮", "SLO-LI CHU", "資訊二乙", "CSB", "1142", "CS340E"],
 ["資料結構與演算法(遠距)", "Data Structures and Algorithms(distance)", "吳宜鴻", "WU,YI-HUNG", "資訊二乙", "CSB", "1142", "CS217E"],
 ["實用英文(二)", "Practical English (II)", "彭怡婷", "I-ting Peng", "應數二甲", "MAB", "1142", "MA702D"],
 ["實用英文(一)", "Practical English (I)", "彭怡婷", "I-ting Peng", "應數二甲", "MAB", "1141", "MA701D"],
 ["認識大數據", "Understanding Big Data", "李孟哲", "LEE-MEG CHE", "延伸選修通識", "GEB", "1141", "GE776A"],
 ["工程數學(一)", "Engineering Mathematics(1)", "張元翔", "YUAN-HSIANG CHANG", "資訊二乙", "CSB", "1141", "CS316E"],
 ["資料結構", "Data Structures", "吳宜鴻", "WU,YI-HUNG", "資訊二乙", "CSB", "1141", "CS258E"],
 ["組合語言與嵌入式系統", "Assembly Language and Embedded System", "朱守禮", "SLO-LI CHU", "資訊二乙", "CSB", "1141", "CS218E"],
 ["數位邏輯電路設計", "Logic Design", "", "", "資訊二乙", "CSB", "1141", "CS210E"],
 ["電路學", "Circuit Theory", "湯松年", "TANG, SONG-NIEN", "資訊二乙", "CSB", "1141", "CS162E"],
 ["英文(二)", "English (II)", "沈俞君", "SHEN, YU-CHUN", "工業管理組一丙", "IE", "1132", "IE609C"],
 ["排球二(男.女)", "Volleyball (M.F) 2", "陳克舟", "CHEN, KE-CHOU", "體育興趣", "GRB", "1132", "GR575A"],
 ["區域文明史", "History of Regional Civilizations", "吳佳融", "Wu,Chia-Jung", "基礎必修通識", "GQB", "1132", "GQ456J"],
 ["宗教哲學", "Philosophy of Religion", "鄭偉光", "CHENG, WEI-KUANG", "基礎必修通識", "GQB", "1132", "GQ101Z"],
 ["運算思維與程式設計", "Computational thinking and programming", "夏延德", "HSIA, YEN-TEH", "資訊一乙", "CSB", "1132", "CS888B"],
 ["語文與修辭", "Literacy and Rhetoric", "莊凱雯", "CHUANG, KAI WEN", "資訊一乙", "CSB", "1132", "CS801B"],
 ["線性代數", "Linear Algebra", "蔡明達", "TSAI, MING-DAR", "資訊一乙", "CSB", "1132", "CS386B"],
 ["計算機概論(二)", "Introduction to Computer (II)", "余執彰", "Yu, Chih-Chang", "資訊一乙", "CSB", "1132", "CS243B"],
 ["嵌入式系統實驗(二)", "Embedded System Laboratory(2)", "莊啓宏", "CHUANG, CHI-HUNG", "資訊一乙", "CSB", "1132", "CS112B"],
 ["文學經典閱讀", "Chinese Literature Classics", "莊凱雯", "CHUANG, KAI WEN", "資訊一乙", "CSB", "1131", "CS701B"],
 ["自然科學與人工智慧導論", "Introduction to Natural Science and Artificial Intelligence", "", "", "資訊一乙", "CSB", "1131", "CS000B"],
 ["英文(一)", "English (I)", "沈俞君", "SHEN, YU-CHUN", "工業管理組一丙", "IE", "1131", "IE609C"],
 ["英語聽講(一)", "English Listening and Speaking in Lab (I)", "賴美智", "LAI, MEI-CHIH", "資訊一乙", "CSB", "1131", "CS059B"],
 ["計算機概論(一)", "Introduction to Computer (I)", "余執彰", "Yu, Chih-Chang", "資訊一乙", "CSB", "1131", "CS240B"],
 ["嵌入式系統實驗(一)", "Embedded System Laboratory(1)", "張元翔", "YUAN-HSIANG CHANG", "資訊一乙", "CSB", "1131", "CS111B"],
 ["普通物理", "General Physics", "周志隆", "CHIH-LUNG CHOU", "資訊一乙", "CSB", "1131", "CS038B"],
 ["普通物理實驗(一)", "General Physics Laboratory (I)", "蔡東昇", "Dung-Sheng Tsai", "資訊一乙", "CSB", "1131", "CS144B"],
 ["微積分(上)", "Calculus (I)", "楊奕祐", "Yi-You Yang", "資訊一乙", "CSB", "1131", "CS050B"],
 ["離散數學", "Discrete Mathematics", "莊秀敏", "CHUANG, HSIU-MIN", "資訊一乙", "CSB", "1131", "CS261B"],
 ["體育一", "Physical Education (I)", "張建淳", "CHANG, CHIEN-CHUN", "資訊一乙", "CSB", "1131", "CS945B"],
] as const;
it('covers all 47 catalog rows',() => {expect(rows).toHaveLength(47);expect(expected).toHaveLength(47);});
it.each(expected.map((value,index) => ({value,index})))('parses catalog row $index',({value,index}) => {
 const [zh,en,teacherZh,teacherEn,classZh,classEn,term,code] = value;
 const [fullName,shortName,progress,startAt,endAt] = rows[index]!;
 const identity = parseCourseIdentity(fullName!,shortName!,progress !== '');
 expect(identity).toMatchObject({title:{zh:zh || null,en:en || null},teachers:teacherZh || teacherEn ? [{zh:teacherZh || null,en:teacherEn || null}] : [],classLabel:{zh:classZh || null,en:classEn || null},term,code:code || null});
 for (const title of Object.values(identity.title)) if (title) {expect(title).not.toMatch(/\[|^\d{3,4}/);}
 if (identity.teachers.length && identity.title.en) expect(identity.title.en.replace(/\b(?:II|III|IV|VI?)$/,'')).not.toMatch(/\b[A-Z]{2,}$/);
 expect(courseLifecycle({startAt:startAt || null,endAt:endAt || null,term:identity.term},new Date('2026-11-04T04:00:00Z'))).toEqual({lifecycle:term === '1151' ? 'current' : 'past',lifecycleSource:'dates'});
});
it('uses authoritative names to clean uncertain suffixes and preserves bilingual names',() => {
 const identity = parseCourseIdentity('1151作業系統-鍾武君(資訊三乙)[CS267H]1151Operating Systems-WU-CHUN CHUNG(CSB)[CS267H]','1151_CS267H');
 expect(applyAuthoritativeTeachers(identity,[{zh:'鍾武君',en:null}]).teachers).toEqual([{zh:'鍾武君',en:'WU-CHUN CHUNG'}]);
 expect(applyAuthoritativeTeachers({...identity,title:{zh:'課程-王老師',en:'Course-Jane de Vries'}},[{zh:'王老師',en:'Jane de Vries'}]).title).toEqual({zh:'課程',en:'Course'});
});
