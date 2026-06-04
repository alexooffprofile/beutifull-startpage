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

const row = document.getElementById('shortcuts-row');

const shortcuts = [
  {
    title: 'GitHub',
    url: 'https://github.com',
    bg: null, // без картинки — просто тёмный фон
  },
  {
    title: 'YouTube',
    url: 'https://youtube.com',
    bg: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg', // внешний URL
  },
  {
    title: 'Gmail',
    url: 'https://gmail.com',
    bg: localStorage.getItem('bnt_sc_thumb_gmail'), // из localStorage (base64)
  },
];

function s() {
shortcuts.forEach(({ title, url, bg }) => {
    const domain = new URL(url).hostname;
    const favicon = `https://www.google.com/s2/favicons?sz=64&domain_url=${url}`;

    const card = document.createElement('div');
    card.className = 'sc-card';

    if (bg) card.dataset.hasThumb = '1';

    card.innerHTML = `
        <div class="sc-bg" ${bg ? `style="background-image:url('${bg}')"` : ''}></div>
        <div class="sc-overlay"></div>
        <img class="sc-favicon" src="${favicon}">
        <div class="sc-info">
        <div class="sc-title">${title}</div>
        <div class="sc-domain">${domain}</div>
        </div>
    `;
    card.addEventListener('click', () => window.open(url, '_blank'));
    row.appendChild(card);
    });

    row.classList.add('sc-ready');
}


s();