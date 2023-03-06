window.addEventListener('DOMContentLoaded', () => {
  const container = document.querySelector('#container'),
    nav = container.querySelector(':scope > nav'),
    menu = nav.querySelector(':scope > ul'),
    article = container.querySelector(':scope > article'),
    template = document.querySelector('#menu-item'),
    menu_item = template.innerText;

  template.remove();
  article.addEventListener('scroll', menu_select);

  // select
  for (const select of document.querySelectorAll('[select]')) {
    const name = `select-${select.getAttribute('select')}`,
      label = select.querySelector(':scope > span'),
      list = select.querySelector(':scope > ul');

    let selected = '',
      values = [];

    for (const item of list.querySelectorAll(':scope > li')) {
      const value = item.innerText;

      values.push(value);
      if (!selected && item.hasAttribute('selected')) {
        selected = value;
      }

      let storage = localStorage.getItem(name);
      if (storage) {
        selected = storage;
      }

      item.addEventListener('click', () => {
        list.classList.remove('is-active');
        label.innerText = value;

        localStorage.setItem(name, value);
        list.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      }, false);
    }

    label.innerText = selected || (values.length ? values[0] : ' ');
    select.addEventListener('click', event => {
      if (event.target.nodeName.toLowerCase() !== 'li') {
        list.classList.toggle('is-active');
      }
    }, false);
  }

  // langs
  let langs = [];
  for (const lang of document.querySelectorAll('[select="lang"] > ul > li')) {
    langs.push(lang.innerText);
  }
  document.querySelector('[select="lang"]').addEventListener('change', () => {
    load_page();
  }, false);

  // versions
  let versions = [];
  for (const version of document.querySelectorAll('[select="version"] > ul > li')) {
    versions.push(version.innerText);
  }
  document.querySelector('[select="version"]').addEventListener('change', () => {
    load_page();
  }, false);

  // load page
  load_page(() => {
    if (document.location.hash) {
      const anchor = article.querySelector(document.location.hash);
      if (anchor) {
        setTimeout(() => {
          anchor.scrollIntoView({ behavior: 'smooth' }, true);
        }, 250);
      }
    }
  });

  // methods
  let menu_timeout = 0;
  function menu_select() {
    const anchors = article.querySelectorAll('[id]');

    let anchor = anchors[0];
    for (const item of anchors) {
      const top = item.offsetTop - 10;
      if (top <= article.scrollTop) {
        anchor = item;
      } else if (top > article.scrollTop) {
        break;
      }
    }

    const sublink = nav.querySelector(`li > a[href="#${anchor.getAttribute('id')}"]`),
      submenu = sublink ? sublink.parentElement : false;

    if (submenu) {
      clearTimeout(menu_timeout);
      menu_timeout = setTimeout(() => {
        let offset_top = 0,
          offset_height = sublink.offsetHeight;

        for (const item of nav.querySelectorAll('li.is-active')) {
          item.classList.remove('is-active');
        }

        for (let id = 6, parent = submenu; id > 0 && parent; --id) {
          parent.classList.add('is-active');
          parent = parent.parentElement.closest('li');
        }

        for (let id = 6, parent = submenu; id > 0 && parent; --id) {
          offset_top += parent.offsetTop + parent.parentElement.offsetTop;
          parent = parent.parentElement.closest('li');
        }
        offset_top -= menu.offsetTop;

        if (nav.scrollTop > (offset_top - offset_height) || (nav.scrollTop + nav.offsetHeight) < offset_top) {
          nav.scrollTo({
            top: Math.max(0, (offset_top - (nav.offsetHeight / 2))),
            behavior: 'smooth'
          });
        }
      }, 10);
    }
  }

  function load_page(callback) {
    const lang_label = document.querySelector('[select="lang"] > span'),
      version_label = document.querySelector('[select="version"] > span');

    let page = document.location.search.substring(1);
    if (!/^[A-Z-]+$/gi.test(page)) {
      page = 'home';
    }

    let lang = lang_label.innerText;
    if (langs.indexOf(lang) < 0) {
      lang = langs[0];
      lang_label.innerText = lang;
    }

    let version = version_label.innerText;
    if (versions.indexOf(version) < 0) {
      version = versions.slice(-1)[0];
      version_label.innerText = version;
    }

    fetch(`./pages/${lang}/${version}/${page}.html`)
      .then(res => {
        if (res.status === 200) {
          return res.text();
        }
      })
      .then(content => {
        if (typeof content !== 'undefined') {
          article.innerHTML = content;

          const template = document.createElement('div');
          template.insertAdjacentHTML('beforeend', menu_item);

          setTimeout(() => {
            const menu_item = template.children[0],
              arbo = [],
              insert = (id, elem) => {
                if (!arbo.length) {
                  arbo.push({ id, elem: elem.querySelector('ul') });
                  menu.appendChild(elem);
                } else if (arbo[arbo.length - 1].id < id) {
                  arbo[arbo.length - 1].elem.appendChild(elem);
                  arbo.push({ id, elem: elem.querySelector('ul') });
                } else {
                  arbo.pop();
                  insert(id, elem);
                }
              };

            menu.innerHTML = '';
            for (const header of article.querySelectorAll('h1 > a[id], h2 > a[id], h3 > a[id], h4 > a[id], h5 > a[id], h6 > a[id]')) {
              const id = parseInt(header.parentElement.nodeName[1]),
                elem = menu_item.cloneNode(true),
                a = elem.querySelector('a');

              a.setAttribute('href', `#${header.getAttribute('id')}`);
              a.innerText = header.parentElement.innerText.split('-').slice(-1)[0];

              insert(id, elem);
            }

            for (const submenu of menu.querySelectorAll('li > ul')) {
              if (!submenu.children.length) {
                submenu.parentElement.querySelector(':scope > .caret').remove();
                submenu.remove();
              }
            }

            menu_select();
            if (callback) {
              callback();
            }
          }, 100);
        }
      });
  }
}, false);