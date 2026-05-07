const randomTitles = [
  "Лучшая вкладочка",
  "Мой глазик нашёл алмазик",
  "СИК СЕВЕН ПАДЖЕ",
  "Бютефулл падже",
  "Снова ты это гуглишь?",
  "144 мегаящиков",
  "Момчег на пуджателя",
  "Потужна сторінка",
  "🤏",
  "🤡"
];

const icons = [
    "icons/default_ico48.png",
    "icons/lime_ico48.png",
    "icons/red_ico48.png",
    "icons/pink_ico48.png",
    "icons/yellow_ico48.png"
];


function setRandomTabTitle() {
    const title =
    randomTitles[
        Math.floor(Math.random() * randomTitles.length)
    ];
    
    document.title = title;
}

document.getElementById("favicon").href =
 icons[Math.floor(Math.random()*icons.length)];

setRandomTabTitle();