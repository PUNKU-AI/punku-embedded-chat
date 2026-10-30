import { belowBlockingDialog, blockingDialogZIndex, pageLayerZIndex, readPageDialogs } from './pageDialogs';

// jsdom has no layout: give an element a box on the screen (a 1024 x 768 window).
function place(element: Element, left = 20, top = 40, width = 280, height = 300) {
  element.getBoundingClientRect = () => ({
    x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}),
  }) as DOMRect;
}

function addToPage(html: string) {
  const holder = document.createElement('div');
  holder.innerHTML = html;
  document.body.appendChild(holder);
}

const byId = (id: string) => document.getElementById(id)!;

afterEach(() => {
  document.body.innerHTML = '';
});

describe('pageLayerZIndex', () => {
  it('takes the outermost positioned ancestor with a z-index', () => {
    addToPage('<div style="position:fixed;z-index:999999"><div style="position:relative;z-index:5"><div id="d"></div></div></div>');
    expect(pageLayerZIndex(byId('d'))).toBe(999999);
  });

  it('ignores a z-index on a static element', () => {
    addToPage('<div style="z-index:50"><div id="d"></div></div>');
    expect(pageLayerZIndex(byId('d'))).toBeNull();
  });

  it('takes the z-index of a flex item', () => {
    addToPage('<div style="display:flex"><div style="z-index:7"><div id="d"></div></div></div>');
    expect(pageLayerZIndex(byId('d'))).toBe(7);
  });

  it('takes 0 for a dialog inside a transformed or translucent ancestor', () => {
    // The ancestor makes a stacking context at 0: the inner 999999 counts only inside it.
    addToPage('<div style="transform:translateX(0)"><div style="position:fixed;z-index:999999"><div id="a"></div></div></div>'
      + '<div style="opacity:0.99"><div style="position:fixed;z-index:999999"><div id="b"></div></div></div>');
    expect(pageLayerZIndex(byId('a'))).toBe(0);
    expect(pageLayerZIndex(byId('b'))).toBe(0);
  });
});

describe('blockingDialogZIndex', () => {
  it('finds a visible modal dialog in its layer (Borlabs Cookie)', () => {
    addToPage('<div style="position:fixed;z-index:999999"><div id="d" role="alertdialog" aria-modal="true">Privacy</div></div>');
    place(byId('d'));
    expect(blockingDialogZIndex()).toBe(999999);
  });

  it('finds an alert dialog without aria-modal', () => {
    addToPage('<div id="d" role="alertdialog" style="position:fixed;bottom:0;z-index:99999">We use cookies.</div>');
    place(byId('d'));
    expect(blockingDialogZIndex()).toBe(99999);
  });

  it('finds a cookie dialog without the modal mark (CookieScript)', () => {
    addToPage('<div id="cookiescript_injected" role="dialog" aria-label="Cookie consent dialog" '
      + 'style="position:fixed;bottom:0;z-index:999997">We use cookies.</div>');
    place(byId('cookiescript_injected'));
    expect(blockingDialogZIndex()).toBe(999997);
  });

  it('finds a consent dialog in the open shadow root of a body child (Usercentrics)', () => {
    // aside#usercentrics-cmp-ui > #shadow-root > div (fixed, 2147483646) > #uc-main-dialog.
    const host = document.createElement('aside');
    host.id = 'usercentrics-cmp-ui';
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div style="position:fixed;z-index:2147483646">'
      + '<div id="uc-main-dialog" role="dialog" class="cmp first bottom mobile ltr gdpr">We use cookies.</div></div>';
    place(root.getElementById('uc-main-dialog')!);
    expect(blockingDialogZIndex()).toBe(2147483646);
  });

  it('reads the aria-labelledby heading inside the same shadow root', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<div id="d" role="dialog" aria-labelledby="t" style="position:fixed;z-index:700">'
      + '<h2 id="t">Cookie settings</h2></div>';
    place(root.getElementById('d')!);
    expect(blockingDialogZIndex()).toBe(700);
  });

  it('finds a consent dialog by the text of its aria-labelledby heading', () => {
    addToPage('<div id="d" role="dialog" aria-labelledby="t" style="position:fixed;z-index:500">'
      + '<h2 id="t">Datenschutz-Einstellungen</h2></div>');
    place(byId('d'));
    expect(blockingDialogZIndex()).toBe(500);
  });

  it('finds an unmarked consent backdrop over the whole screen (Contao privacy opt-in)', () => {
    addToPage('<div id="privacy_optin_611" class="mod_privacy_optin open">'
      + '<div id="d" class="privacy_overlay" style="position:fixed;z-index:10000000"></div></div>');
    // jsdom's window is 1024 x 768.
    place(byId('d'), 0, 0, 1024, 768);
    expect(blockingDialogZIndex()).toBe(10000000);
  });

  it('finds a backdrop named in upper case (GDPR, DSGVO)', () => {
    addToPage('<div id="d" class="GDPR-OVERLAY" style="position:fixed;z-index:500000"></div>');
    place(byId('d'), 0, 0, 1024, 768);
    expect(blockingDialogZIndex()).toBe(500000);
  });

  it('ignores a small cookie settings button and a consent box that does not cover the screen', () => {
    addToPage('<div id="a" class="cookie-settings-button" style="position:fixed;z-index:999998"></div>'
      + '<div id="b" class="cookie-policy" style="z-index:5"></div>');
    place(byId('a'), 0, 720, 48, 48);
    place(byId('b'), 0, 0, 1024, 768);
    expect(blockingDialogZIndex()).toBeNull();
  });

  it('takes the lowest layer of several dialogs: the widget stays below each one', () => {
    // The Contao opt-in on a 320 px phone: the backdrop at 10000000, the box at 20000000.
    addToPage('<div id="a" class="privacy_overlay" style="position:fixed;z-index:10000000"></div>'
      + '<div id="b" class="privacy_popup" style="position:fixed;z-index:20000000"></div>');
    place(byId('a'), 0, 0, 1024, 768);
    place(byId('b'), 16, 0, 960, 600);
    expect(blockingDialogZIndex()).toBe(10000000);
  });

  it('ignores a dialog without a box, outside the screen, hidden or transparent', () => {
    addToPage('<div style="position:fixed;z-index:999999"><div id="a" aria-modal="true"></div></div>'
      + '<div style="position:fixed;z-index:999999"><div id="b" aria-modal="true"></div></div>'
      + '<div style="position:fixed;z-index:999999;visibility:hidden"><div id="c" aria-modal="true"></div></div>'
      + '<div style="position:fixed;z-index:999999;opacity:0"><div id="d" aria-modal="true"></div></div>');
    // An off-canvas menu moved out of the screen.
    place(byId('b'), -400);
    place(byId('c'));
    place(byId('d'));
    expect(blockingDialogZIndex()).toBeNull();
  });

  it("ignores the widget's own dialogs", () => {
    addToPage('<div class="cl-widget-root" style="position:fixed;z-index:2147483000">'
      + '<dialog id="d" aria-modal="true" open>Checkout</dialog></div>');
    place(byId('d'));
    expect(blockingDialogZIndex()).toBeNull();
  });

  it('ignores a dialog that the visitor does not have to answer, such as a chat greeting', () => {
    addToPage('<div id="d" role="dialog" style="position:fixed;z-index:99999999">Chat with us on WhatsApp.</div>');
    place(byId('d'));
    expect(blockingDialogZIndex()).toBeNull();
  });
});

describe('readPageDialogs: a dialog over the trigger (WCAG 2.4.11)', () => {
  // The trigger in the bottom-right corner of the 1024 x 768 window.
  const addTrigger = (box: [number, number, number, number] = [952, 700, 48, 48]) => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    place(trigger, ...box);
    return trigger;
  };

  it('finds a cookie bar over the whole trigger', () => {
    addToPage('<div id="d" role="dialog" aria-label="Cookie consent dialog" style="position:fixed;bottom:0;z-index:999997">We use cookies.</div>');
    place(byId('d'), 0, 568, 1024, 200);
    expect(readPageDialogs(addTrigger())).toEqual({ zIndex: 999997, covers: true });
  });

  it('finds a banner above the widget layer, such as Cookiebot', () => {
    addToPage('<div id="d" role="dialog" aria-modal="true" style="position:fixed;bottom:0;z-index:2147483631">We use cookies.</div>');
    place(byId('d'), 0, 468, 1024, 300);
    expect(readPageDialogs(addTrigger()).covers).toBe(true);
  });

  it('finds a consent backdrop over the whole screen (Contao privacy opt-in)', () => {
    addToPage('<div id="d" class="privacy_overlay" style="position:fixed;z-index:10000000"></div>');
    place(byId('d'), 0, 0, 1024, 768);
    expect(readPageDialogs(addTrigger()).covers).toBe(true);
  });

  it('does not count a dialog that covers only a part of the trigger or another place', () => {
    addToPage('<div id="a" role="dialog" aria-label="Cookie consent dialog" style="position:fixed;bottom:0;z-index:999997"></div>'
      + '<div id="b" role="alertdialog" aria-modal="true" style="position:fixed;z-index:999999"></div>');
    // A slim bar over the lower half of the trigger, and a dialog in the middle of the screen.
    place(byId('a'), 0, 724, 1024, 44);
    place(byId('b'), 362, 234, 300, 300);
    expect(readPageDialogs(addTrigger())).toEqual({ zIndex: 999997, covers: false });
  });

  it('does not count a hidden dialog, a dialog in no layer, or the widget\'s own dialog', () => {
    addToPage('<div id="a" role="dialog" aria-label="Cookie consent dialog" style="position:fixed;z-index:999997;visibility:hidden"></div>'
      + '<div id="b" role="alertdialog" aria-modal="true">Static dialog</div>'
      + '<div class="cl-widget-root" style="position:fixed;z-index:2147483000"><dialog id="c" aria-modal="true" open>Checkout</dialog></div>');
    for (const id of ['a', 'b', 'c']) place(byId(id), 0, 0, 1024, 768);
    expect(readPageDialogs(addTrigger())).toEqual({ zIndex: null, covers: false });
  });

  it('does not count a trigger without a box, such as a trigger that the site hides', () => {
    addToPage('<div id="d" class="privacy_overlay" style="position:fixed;z-index:10000000"></div>');
    place(byId('d'), 0, 0, 1024, 768);
    expect(readPageDialogs(addTrigger([0, 0, 0, 0])).covers).toBe(false);
    expect(readPageDialogs(null).covers).toBe(false);
  });
});

describe('belowBlockingDialog', () => {
  it.each([
    [2147483000, null, 2147483000],
    // Borlabs Cookie: the widget goes just below the dialog's layer.
    [2147483000, 999999, 999998],
    [999999, 999999, 999998],
    // A dialog above the widget already, for example Cookiebot.
    [2147483000, 2147483631, 2147483000],
    [500, 999999, 500],
    [2147483000, 0, 0],
  ])('gives the widget z-index %p with a dialog layer at %p the value %p', (zIndex, dialog, expected) => {
    expect(belowBlockingDialog(zIndex, dialog)).toBe(expected);
  });
});
