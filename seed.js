// Seed data: the full Zangief history from the original Google Sheet, cleaned up.
// Empty drag-filled rows from the "hits" sheet were dropped; ranks are
// re-derived from LP so the handful of mislabeled rank cells self-correct.
//
// Match fields:   date | result | lpBefore | delta | rounds (+ = round won, - = round lost, per the sheet's
//                 green/red cells; matches 107/108 had W/L swapped vs colors+LP and are corrected) |
//                 oppLP ('' = New Challenger) | oppChar | note
// Defense fields: match | oppChar | health% | round | attempt | oppOffense | result | wakeup | inCorner | note
// Hit fields:     match | oppChar | health% | round | hitType | reason | wakeup | panic | poorDecision | note

const SEED = {
  matches: `
2025-02-09|W|19104|57|-P,+V,+V|19339|Ed|
2025-02-09|L|19161|-40|-OD,+V,-OD|19299|Ed|
2025-02-09|L|19121|-40|-V,+V,-V|19354|Ed|
2025-02-09|L|19081|-40|-V,-P|20161|Chun-Li|
2025-02-09|L|19041|-40|-SA,-V|20216|Chun-Li|
2025-02-09|W|19001|78|+V,+V|21309|Terry|
2025-02-09|L|19079|-40|+V,-P,-V|21269|Terry|
2025-02-09|W|19039|77|+V,+OD|21319|Terry|
2025-02-09|L|19116|-40|-V,-P|19587|Mai|
2025-02-09|L|19076|-40|-V,+V,-V|19642|Mai|
2025-02-09|L|19036|-36|-V,+V,-V|21129|Ed|
2025-02-09|W|19000|76|-OD,+P,+V|21179|Ed|
2025-02-09|L|19076|-40|-V,-V|21139|Ed|
2025-02-09|L|19036|-36|-P,-SA|19950|Mai|
2025-02-09|L|19000|-40|-V,+SA,-V|20005|Mai|
2025-02-09|L|18960|-40|-V,-V|18880|Ken|
2025-02-09|L|18920|-40|-V,+V,-SA|18931|Ken|
2025-02-09|W|18880|65|+V,+SA|16631|Ryu|
2025-02-09|W|18945|65|+V,+SA|16671|Ryu|
2025-02-09|L|19010|-10|-OD,+V,-V|21240|M. Bison|
2025-02-09|W|19000|77|+V,-V,+CA|21290|M. Bison|
2025-02-09|W|19077|76|+OD,-V,+V|21250|M. Bison|
2025-02-09|L|19153|-40|-OD,-SA|21340|Cammy|
2025-02-09|W|19113|77|+V,-V,+V|21390|Cammy|
2025-02-09|L|19190|-40|-V,-SA|21350|Cammy|
2025-02-09|L|19150|-40|-V,+V,-P|18814|Mai|
2025-02-09|W|19110|55|+V,+V|18882|Mai|
2025-02-09|W|19165|55|+V,+V|18842|Mai|
2025-02-09|W|19220|75|+V,+OD|21284|Mai|
2025-02-09|W|19295|74|+OD,+V|21244|Mai|
2025-02-09|L|19369|-40|-V,-V|18720|Mai|
2025-02-09|W|19329|55|-OD,+V,+V|18781|Mai|
2025-02-09|W|19384|55|+V,+V|18741|Mai|
2025-02-09|L|19439|-40|-V,-V|18268|Marisa|
2025-02-09|W|19399|55|+V,+SA|19295|Mai|
2025-02-09|W|19454|55|-V,+SA,+V|19255|Mai|
2025-02-09|W|19509|55|-V,+V,+V|19320|Ryu|
2025-02-09|L|19564|-40|+V,-V,-V|19280|Ryu|
2025-02-09|L|19524|-40|-V,-V|19332|Ryu|
2025-02-09|W|19484|57|-V,+V,+V|19729|Mai|
2025-02-09|W|19541|56|+V,-V,+OD|19689|Mai|
2025-02-09|W|19597|55|-V,+V,+V|18404|M. Bison|
2025-02-09|W|19652|55|+OD,+V|18364|M. Bison|
2025-02-09|W|19707|55|+V,+V|19554|Terry|
2025-02-09|L|19762|-40|+V,-SA,-V|19514|Terry|
2025-02-09|L|19722|-40|-V,-V|19566|Terry|
2025-02-09|L|19682|-40|-V,-V|18665|Mai|
2025-02-09|W|19642|55|+V,+V|18740|Mai|
2025-02-09|W|19697|55|+V,+V|18700|Mai|
2025-02-09|L|19752|-40|-SA,-SA|18764|Luke|
2025-02-09|W|19712|55|-V,+V,+V|18823|Luke|
2025-02-09|L|19767|-40|-P,-SA|18783|Luke|
2025-02-09|L|19727|-40|-V,-V|20986|Cammy|
2025-02-09|W|19687|68|+V,-V,+V|21041|Cammy|
2025-02-09|L|19755|-40|-V,-V|21001|Cammy|
2025-02-09|W|19715|56|-V,+V,+SA|19753|Terry|
2025-02-09|W|19771|55|+OD,+V|19713|Terry|
2025-02-09|W|19826|55|+V,+V||Mai|
2025-02-09|W|19881|55|-V,+V,+V||Mai|
2025-02-09|W|19936|67|+V,+SA|21221|Mai|
2025-02-09|L|20003|-40|+V,-OD,-SA|21181|Mai|
2025-02-09|W|19963|67|+V,+V|21236|Mai|
2025-02-09|L|20030|-40|+V,-V,-SA|21068|Mai|
2025-02-09|L|19990|-40|+V,-V,-V|21123|Mai|
2025-02-09|L|19950|-40|-V,-P|19000|Ken|
2025-02-09|W|19910|55|+SA,+V|19059|Ken|
2025-02-09|L|19965|-40|-OD,-CA|19019|Ken|
2025-02-09|W|19925|55|+V,+V|19808|JP|
2025-02-09|L|19980|-40|-V,-V|19768|JP|
2025-02-09|L|19940|-40|+V,-V,-V|19825|JP|
2025-02-09|L|19900|-40|-V,-V|18645|Mai|
2025-02-09|L|19860|-40|-V,-OD|18712|Mai|
2025-02-09|W|19820|55|+V,+V|19383|Dee Jay|
2025-02-09|L|19875|-40|-V,+V,-V|19343|Dee Jay|
2025-02-09|L|19835|-40|-V,+CA,-C|19403|Dee Jay|
2025-02-09|L|19795|-40|-V,-SA|19535|Mai|
2025-02-09|L|19755|-40|+V,-V,-V|19592|Mai|
2025-02-09|W|19715|55|-V,+V,+SA|19351|Mai|
2025-02-09|W|19770|55|+OD,-V,+SA|19311|Mai|
2025-02-09|L|19825|-40|-SA,+V,-V||Mai|Modern Controls
2025-02-09|W|19785|59|+OD,-OD,+V||Mai|Modern Controls
2025-02-09|W|19844|55|+V,+P||Mai|Modern Controls
2025-02-09|W|19899|-40|-V,+OD,+OD|18237|E. Honda|
2025-02-09|W|19859|55|+V,+V|18303|E. Honda|
2025-02-09|W|19914|55|+V,+V|18263|E. Honda|
2025-02-09|L|19969|-40|-V,-V|20376|Mai|
2025-02-09|L|19929|-40|-V,+SA,-V|20431|Mai|
2025-02-09|W|19889|55|+V,+V|18138|Mai|
2025-02-09|W|19944|55|+V,+V|18098|Mai|
2025-02-09|L|19999|-40|-V,-SA|19827|Ryu|Modern Controls
2025-02-09|W|19959|55|+V,-V,+V|19878|Ryu|Modern Controls
2025-02-09|L|20014|-40|+OD,-SA,-CA|19838|Ryu|Modern Controls
2025-02-09|W|19974|55|+V,-SA,+V|17960|Zangief|
2025-02-09|W|20029|55|+OD,+V|17920|Zangief|
2025-02-09|W|20084|55|-V,+V,+V|19297|Mai|
2025-02-09|L|20139|-40|-V,+V,-OD|19257|Mai|
2025-02-09|W|20099|55|-V,+CA,+V|19320|Mai|
2025-02-09|L|20154|-40|-OD,+V,-SA|19959|Ed|
2025-02-09|W|20114|55|+V,+V|20010|Ed|
2025-02-09|W|20169|55|+V,+V|19970|Ed|Promotion to Diamond 2
2025-02-15|W|20224|55|-V,+V,+P|19739|Akuma|
2025-02-15|L|20279|-40|-V,+V,-SA|19699|Akuma|
2025-02-15|W|20239|55|+V,+CA|19754|Akuma|
2025-02-15|L|20294|-40|-V,+OD,-OD|21430|Mai|Bad Internet
2025-02-15|W|20254|55|+V,+V|20165|Ken|Modern Controls
2025-02-15|W|20309|55|+V,+SA|20125|Ken|Win with SA2 thru fireball
2025-02-15|L|20364|-40|-V,+V,-OD|20362|Mai|
2025-02-16|W|20324|56|-V,+V,+V|20413|Mai|
2025-02-16|W|20380|55|+V,-V,+V|20373|Mai|
2025-02-16|W|20435|62|+V,+CA|21188|Akuma|
2025-02-16|L|20497|-40|-V,-SA|21148|Akuma|
2025-02-16|W|20457|62|+SA,-SA,+CA|21203|Akuma|
2025-02-16|L|20519|-40|-V,+CA,-SA|21854|Mai|
2025-02-16|W|20479|69|+V,-V,+CA|21909|Mai|
2025-02-16|L|20548|-40|-V,+CA,-V|21869|Mai|
2025-02-16|W|20508|55|+V,+V|19135|Dee Jay|
2025-02-16|W|20563|55|-V,+V,+V|19095|Dee Jay|
2025-02-16|W|20618|74|+V,-V,+V|22530|Ken|
2025-02-16|W|20692|72|+V,+V|22490|Ken|
2025-02-16|W|20764|55|+V,-V,+V|19327|M. Bison|
2025-02-16|W|20819|55|-OD,+SA,+V|19287|M. Bison|
2025-02-16|W|20874|55|-V,+V,+V|20058|Ken|
2025-02-16|W|20929|55|+V,+V|20018|Ken|
2025-02-16|L|20984|-40|+V,-SA,-SA|20681|Akuma|
2025-02-16|W|20944|55|+V,+V|20525|Mai|
2025-02-16|L|20999|-40|-V,+V,-V|20485|Mai|
2025-02-16|W|20959|55|+V,+SA|20540|Mai|
2025-02-16|W|21014|66|-V,+SA,+V|22165|Manon|
2025-02-16|W|21080|65|-V,+V,+V|22125|Manon|
2025-02-16|L|21145|-40|-V,-V|22440|Cammy|
2025-02-16|W|21105|68|+V,-SA,+V|22490|Cammy|Modern Controls
2025-02-16|W|21173|67|+V,+V|22450|Cammy|
2025-02-16|W|21240|55|-V,+V,+V|19844|Ryu|
2025-02-16|L|21295|-40|-P,-V|19804|Ryu|
2025-02-16|L|21255|-40|-OD,+SA,-SA|19873|Ryu|
2025-02-16|W|21215|68|-V,+V,+CA|22522|Kimberly|
2025-02-16|L|21283|-40|+V,-V,-V|22482|Kimberly|
2025-02-16|L|21243|-40|-OD,-V|22532|Kimberly|
2025-02-16|L|21203|-40|-V,+V,-V|20434|Rashid|
2025-02-16|W|21163|55|+V,-V,+V|20491|Rashid|
2025-02-16|L|21218|-40|-V,-V|20451|Rashid|
2025-02-16|W|21178|55|+V,-V,+V|19026|Mai|
2025-02-16|W|21233|55|-V,+V,+V|19000|Mai|Modern Controls
2025-02-16|L|21288|-40|+V,-V,-V|22140|Mai|
2025-02-16|L|21248|-40|-V,-OD|22085|Mai|
2025-02-16|W|21208|55|-OD,+V,+V|20134|Ryu|
2025-02-16|W|21263|55|-V,+OD,+V|20094|Ryu|
2025-02-16|W|21318|55|+V,+V|20926|Mai|
2025-02-16|L|21373|-40|-V,-P|20886|Mai|
2025-02-16|L|21333|-40|-OD,-P|20945|Mai|
2025-02-16|L|21293|-40|+V,-V,-V|20738|Ed|
2025-02-16|W|21253|55|+V,+V|20793|Ed|
2025-02-16|L|21308|-40|-V,+V,-CA|20753|Ed|Misinputs cost me big time :(((
2025-02-16|L|21268|-40|-SA,+SA,-V|19551|Cammy|
2025-02-16|L|21228|-80|+V,-OD,-V|19623|Cammy|
2025-02-16|L|21148|-40|-V,-V|22480|Blanka|
2025-02-17|W|21108|69|-OD,+P,+V|22530|Blanka|
2025-02-17|L|21177|-40|-V,-OD|22490|Blanka|
2025-02-17|W|21137|55|-V,+P,+P|19679|Zangief|
2025-02-17|L|21192|-40|-V,-V|19639|Zangief|
2025-02-17|L|21152|-40|-V,-SA|19704|Zangief|
2025-02-17|W|21112|55|+V,-V,+V|21070|M. Bison|
2025-02-17|L|21167|-40|-V,-V|21161|Mai|
2025-02-17|W|21127|56|+V,+V|21212|Mai|
`,
  defense: `
7|Terry|50|1|Neutral Jump||Hit|||
7|Terry|40|1|Parry||Parried|||
7|Terry|75|2|Parry||Parried|||
7|Terry|20|2|Neutral Jump||Hit|||
7|Terry|15|2|Block||Thrown|||
7|Terry|15|2|Parry||Thrown|||
7|Terry|35|3|Neutral Jump||Hit|||
7|Terry|35|3|Parry||Parried|||
8|Terry|75|1|Neutral Jump||Jumped|||
8|Terry|60|2|Block||Crushed|||
8|Terry|15|2|Neutral Jump||Hit|||
8|Terry|5|2|Parry||Parried|||Parried 1 hit into block string. Mashed SA3 and hit.
10|Mai|5|2|Block||Blocked|||From Jumping Attack. Mashed SA3 and it hit
11|Ed|75|1|Neutral Jump||Jumped|||
13|Ed|50|1|Jump Out of Corner||Hit|||
13|Ed|45|1|Neutral Jump||Jumped|||Opp jumped with me and ate a dropkick
13|Ed|15|1|Block||Blocked|||
14|Mai|70|1|Parry||Thrown||Yes|
14|Mai|60|1|Block||Reset to Neutral||Yes|Opp jumped
14|Mai|30|1|Block||Reset to Neutral||Yes|
14|Mai|10|1|Drive Impact||Thrown||Yes|
14|Mai|60|2|Jump Out of Corner||Hit||Yes|
15|Mai|95|1|Block||Reset to Neutral|Back Roll|No|
15|Mai|70|1|Block||Thrown|Neutral Standup|No|
15|Mai|50|1|Block||Reset to Neutral|Neutral Standup|No|
15|Mai|10|1|A button||Hit|Back Roll|No|
15|Mai|5|1|Block||Blocked|Neutral Standup|No|Lost a few seconds later because I tried to button thru a blockstring
15|Mai|95|2|Parry||Parried|Neutral Standup|No|
15|Mai|50|2|Block||Reset to Neutral|Neutral Standup|No|Opp Jumped
15|Mai|30|2|Neutral Jump||Jumped|Neutral Standup|Yes|Opp tried to throw
15|Mai|95|3|Parry|Jump|Blocked|Neutral Standup|Yes|Opp neutral jump into block
15|Mai|70|3|Jump Out of Corner|Throw|Jumped|Neutral Standup|Yes|Opp tried to throw
15|Mai|60|3|Backdash|Throw|Backdashed|Back Roll|No|
15|Mai|30|3|Parry|Throw|Thrown|Neutral Standup|Yes|
15|Mai|10|3|N/A|Nothing|Reset to Neutral|Neutral Standup|Yes|
16|Ken|40|1|Parry|Button|Parried|Neutral Standup|Yes|
16|Ken|25|1|Neutral Jump|Nothing|Jumped|Neutral Standup|Yes|
16|Ken|10|1|Block|Jump|Blocked|Neutral Standup|Yes|
16|Ken|70|2|N/A|Nothing|Reset to Neutral|Back Roll|No|
16|Ken|60|2|Neutral Jump|Nothing|Reset to Neutral|Neutral Standup|Yes|
17|Ken|80|1|Parry|Button|Parried|Neutral Standup|No|
17|Ken|65|1|Block|Button|Blocked|Back Roll|Yes|
17|Ken|40|1|Throw|Jump|Hit|Neutral Standup|Yes|
17|Ken|15|1|Parry|Jump|Parried|Neutral Standup|Yes|
17|Ken|1|1|Neutral Jump|Nothing|Jumped|Back Roll|Yes|
17|Ken|80|2|Parry|Button|Parried|Neutral Standup|No|
17|Ken|55|2|Neutral Jump|Jump|Hit|Neutral Standup|Yes|
17|Ken|50|2|Neutral Jump|Jump|Opponent Hit|Neutral Standup|Yes|
17|Ken|70|3|Super Art 3|Jump|Hit|Neutral Standup|No|
17|Ken|50|3|Block|Jump|Blocked|Neutral Standup|Yes|
18|Ryu|90|1|N/A|Nothing|Reset to Neutral|Back Roll|No|
18|Ryu|80|1|Parry|Jump|Blocked|Neutral Standup|No|
18|Ryu|45|1|Neutral Jump|Jump|Opponent Hit|Neutral Standup|No|
18|Ryu|30|1|Parry|Ranged Attack|Parried|Neutral Standup|Yes|
19|Ryu|80|1|Neutral Jump|Jump|Opponent Hit|Neutral Standup|Yes|
19|Ryu|95|2|N/A|Nothing|Reset to Neutral|Back Roll|No|
19|Ryu|90|2|Neutral Jump|Ranged Attack|Hit|Neutral Standup|Yes|
19|Ryu|65|2|Block|Ranged Attack|Blocked|Neutral Standup|Yes|SA1 Hit
20|M. Bison|85|1|Neutral Jump|Jump|Hit|Neutral Standup|Yes|Reset situation (got hit from pressing button)
20|M. Bison|40|1|N/A|Nothing|Reset to Neutral|Neutral Standup|No|
20|M. Bison|20|1|Neutral Jump|Jump|Opponent Hit|Neutral Standup|No|
`,
  hits: `
20|M. Bison|100|3|Counter Hit|f.MK followup interrupted|No|No|0|
20|M. Bison|100|3|Clean Hit|Unblocked Hit|No||0|
20|M. Bison|100|3|Counter Hit|Disadvantage|No||0|
20|M. Bison|100|3|Counter Hit|Disadvantage|No||0|
20|M. Bison|100|3|Counter Hit|Misinput|No||0|
20|M. Bison|100|3|Throw|Clean throw|No||0|
20|M. Bison|100|3|Anti-Air|Interrupted Jump Startup|No||4|EX spin was -3, could have better punish
21|M. Bison|100|3|Counter Hit|Air to Air|Yes||2|
21|M. Bison|100|3|Critical Counter|Bad Throw - Out of Range|No||3|was pretty far away tbh
21|M. Bison||1|Counter Hit|Bad Throw Attempt|No||2|
21|M. Bison|||Counter Hit|Bopped in Neutral|No|No|0|bro went for it also i had a bomb on me
21|M. Bison|||Counter Hit|Gap in Block String|No|No|1|
21|M. Bison|||Counter Hit|Air to Air|No|No|0|
21|M. Bison||2|Critical Counter|Bad Drive Impact|No|Yes|0|
21|M. Bison||2|Counter Hit|Bad Wakeup Offense|Yes|No|0|
21|M. Bison||2|Counter Hit|Disadvantage|No|No|0|
21|M. Bison||2|Critical Counter|Bad Throw - Throw Invulnerable|No|No|0|
21|M. Bison||2|Throw|Clean throw|No|No|0|
21|M. Bison||2|Clean Hit|Interrupted Jump Startup|Yes|No|0|
21|M. Bison||2|Throw|Clean throw|No|No|0|
21|M. Bison||2|Counter Hit|Anti-Air|No|No|0|
21|M. Bison||2|Counter Hit|f.MK followup interrupted|||0|
21|M. Bison||3|Counter Hit|Bad Lariat|||0|
21|M. Bison||3|Counter Hit|Disadvantage|||0|
21|M. Bison||3|Clean Hit|Interrupted Jump Startup|||0|
21|M. Bison||3|Counter Hit|MASHING|||0|
21|M. Bison||3|Counter Hit|MASHING|||0|
21|M. Bison||3|Counter Hit|MASHING|||0|
21|M. Bison||3|Counter Hit|MASHING|||0|
21|M. Bison||3||MASHING|||0|
`
};
