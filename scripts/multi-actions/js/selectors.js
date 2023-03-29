let select_diff = false,
  select_move = false;

function move_index(top, force) {
  const diff = -((select_move.top - top) / select_move.height);

  let round = 0;
  if (diff > 0) {
    round = Math.floor(diff);
  } else {
    round = Math.ceil(diff);
  }
  round = Math.round(round);

  if (force || round !== select_diff) {
    select_diff = round;
    return select_move.index + round;
  }

  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  for (const select of document.querySelectorAll('[select]')) {
    const name = `select-${select.getAttribute('select')}`,
      label = select.querySelector(':scope > span'),
      list = select.querySelector(':scope > ul'),
      default_item = list.querySelector(':scope > li').cloneNode(true),
      get_name = item => {
        return item.querySelector(':scope > span').innerText;
      };

    select.refreshSize = () => {
      list.classList.add('is-active');
      if (list.clientWidth) {
        select.style.width = `${list.clientWidth + 4}px`;
      }
      list.classList.remove('is-active');
    };

    select.refreshSelection = name => {
      name = (typeof name === 'string') ? name : select.getValue();

      let selected = false;
      for (const item of list.querySelectorAll(':scope > li')) {
        if (get_name(item) === name) {
          selected = true;
          item.setAttribute('selected', '');
        } else {
          item.removeAttribute('selected');
        }
      }

      return selected;
    };

    select.getValue = () => {
      return label.innerText;
    };

    select.addItem = name => {
      const item = default_item.cloneNode(true);
      item.querySelector(':scope > span').innerText = name;
      list.appendChild(item);

      select.refreshSize();
    };

    select.getValue = () => {
      return label.innerText;
    };

    select.getValues = () => {
      let values = [];
      for (const item of list.querySelectorAll(':scope > li')) {
        values.push(get_name(item));
      }

      return values;
    };

    select.setValue = name => {
      const items = list.querySelectorAll(':scope > li');
      const set = select.refreshSelection(name);
      if (set) {
        label.innerText = name;
      } else if (items.length) {
        items[0].setAttribute('selected', '');
        label.innerText = get_name(items[0]);
      } else {
        label.innerText = '';
      }

      return set;
    };

    select.setEnabled = (name, enable) => {
      for (const item of list.querySelectorAll(':scope > li')) {
        if (item.querySelector(':scope > span').innerText === name) {
          if (typeof enable === 'undefined' || enable) {
            item.removeAttribute('disabled');
          } else {
            item.setAttribute('disabled', '');
          }
        }
      }
    };

    select.removeItem = name => {
      let removed = false;
      for (const item of list.querySelectorAll(':scope > li')) {
        if (item.querySelector(':scope > span').innerText === name) {
          removed = true;
          item.remove();
          break;
        }
      }

      select.refreshSize();

      if (removed && label.innerText === name) {
        const item = list.querySelector(':scope > li');
        label.innerText = item ? item.innerText : '';
      }

      return removed;
    };

    select.openList = () => {
      list.classList.add('is-active');
    }

    select.closeList = () => {
      list.classList.remove('is-active');
    }

    select.removeAll = name => {
      for (const item of list.querySelectorAll(':scope > li')) {
        item.remove();
      }

      label.innerText = '';
    };

    select.setValue('');
    for (const item of list.querySelectorAll(':scope > li')) {
      if (item.hasAttribute('selected')) {
        select.setValue(get_name(item));
        break;
      }
    }

    select.addEventListener('click', event => {
      const elem = event.target,
        item = elem.closest('li');

      if (!elem.classList.contains('fa-grip-lines')) {
        if (item) {
          list.classList.remove('is-active');
          label.innerText = get_name(item);
          select.refreshSelection();

          list.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
        } else {
          list.classList.toggle('is-active');
        }
      }
    }, false);

    select.addEventListener('mousedown', event => {
      const elem = event.target,
        item = elem.closest('li'),
        select = item && item.closest(`[select]`);

      if (elem.classList.contains('fa-grip-lines')) {
        event.preventDefault();

        select_move = {
          elem: select,
          list: item.parentElement,
          name: select.getAttribute('select'),
          top: event.pageY,
          height: item.clientHeight,
          index: Array.prototype.indexOf.call(item.parentElement.children, item),
          item
        };
      }
    }, false);

    select.addEventListener('mousemove', event => {
      window.getSelection().removeAllRanges();
    }, false);
  }
}, false);

document.addEventListener('mousedown', event => {
  if (!event.target.closest('[select]')) {
    for (const list of document.querySelectorAll('[select] > ul')) {
      list.classList.remove('is-active');
    }
  }
}, false);

document.addEventListener('mousemove', event => {
  if (select_move && event.target.closest(`[select="${select_move.name}"]`)) {
    const index = move_index(event.pageY);
    if (index !== false) {
      const items = select_move.elem.querySelectorAll('li');
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        if (i === index) {
          item.setAttribute('select-move', (index === select_move.index) ? 'both' : ((index > select_move.index) ? 'bottom' : 'top'));
        } else {
          item.removeAttribute('select-move');
        }
      }
    }
  }
}, false);

document.addEventListener('mouseup', event => {
  if (select_move && event.target.closest(`[select="${select_move.name}"]`)) {
    let index = move_index(event.pageY, true);
    if (index !== select_move.index) {
      select_move.list.removeChild(select_move.item);
      select_move.list.insertBefore(select_move.item, select_move.list.children[index]);

      window.parent.postMessage({ sort: select_move.elem.getValues() }, '*');
    }
  }

  if (select_move) {
    for (const item of select_move.elem.querySelectorAll('li[select-move]')) {
      item.removeAttribute('select-move');
    }
  }

  select_move = false;
}, false);