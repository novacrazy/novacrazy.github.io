// Narrow-screen sidebar dismissal.
//
// Olivine's sidebars slide over the content on a narrow screen (see
// sass/theme-overrides.scss, which drops the margin that otherwise pushes the
// content aside). The theme gives them exactly one control: the button in the
// header. That is one control too few for a drawer covering the text, and
// there is a way to get stuck with it:
//
//   setSidebar() in themes/olivine/static/olivine.js seeds sessionStorage with
//   "true" the first time it runs above 70rem, and from then on that stored
//   value is applied at every width. Narrow the window afterwards and the bar
//   stays open, covering the page, until the header button is found.
//
// So: tap the page behind an open drawer to dismiss it, press Escape, and have
// the drawers close themselves when the viewport crosses below the breakpoint.
// toggleBar() is olivine.js's own, which keeps sessionStorage in step.
//
// The breakpoint matches the @media query in sass/theme-overrides.scss; change
// both together.
(function () {
    var narrow = window.matchMedia("(max-width: 69.99rem)");

    function close(bar) {
        if (document.body.classList.contains(bar)) toggleBar(bar);
    }

    function closeAll() {
        close("leftbar");
        close("rightbar");
    }

    document.addEventListener("click", function (e) {
        if (!narrow.matches) return;
        if (!(e.target instanceof Element)) return;

        // Following a link out of the drawer. sessionStorage persists the
        // open state across navigation, so without this the page you just
        // chose loads with the drawer still covering it. Requiring [href]
        // skips the directory's "show all" control, which is an <a> with
        // only an onclick and should expand the list in place.
        if (e.target.closest(".sidebar a[href]")) {
            closeAll();
            return;
        }

        // Clicks inside a sidebar, or on the header (whose buttons do their
        // own toggling), are left alone - handling those here would
        // immediately undo the button that opened the drawer.
        if (e.target.closest("header, .sidebar")) return;

        // Anything else is a tap on the content behind the drawer.
        closeAll();
    });

    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") closeAll();
    });

    // Dragging a desktop window narrow, or rotating a phone to portrait.
    narrow.addEventListener("change", function (e) {
        if (e.matches) closeAll();
    });
})();

// Lazy-load the search machinery.
//
// Olivine's base.html loads search_index.en.js, elasticlunr.min.js and
// search.js on every page. Together that is the heaviest thing on the site,
// and the index is the worst of it: elasticlunr stores a character-by-
// character trie, so it runs several times the size of the prose it indexes
// and grows with every post. Paying that on every page view to serve the rare
// visitor who actually searches is the wrong trade, so those tags are gone
// from base.html (LOCAL 12) and the three files are fetched on demand.
//
// Exposed globally because there are two callers: the header box below, and
// the results page in templates/search.html. Loads once however often it is
// called, and queues callbacks until the files are in.
window.loadSearchAssets = (function () {
    var IDLE = 0, LOADING = 1, READY = 2;
    var state = IDLE;
    var waiting = [];

    function flush() {
        while (waiting.length) waiting.shift()();
    }

    function script(path, onload) {
        var s = document.createElement("script");
        s.src = olivine.base_url + "/" + path;
        s.onload = onload;
        document.head.appendChild(s);
    }

    return function (cb) {
        if (cb) waiting.push(cb);
        if (state === READY) return flush();
        if (state === LOADING) return;
        state = LOADING;

        // The index and the library do not depend on each other, so fetch
        // both at once; search.js needs them both present and goes last.
        var pending = 2;
        function ready() {
            if (--pending) return;
            script("search.js", function () {
                state = READY;
                flush();
            });
        }

        script("search_index.en.js", ready);
        script("elasticlunr.min.js", ready);
    };
})();

// Fetch on first contact with the header search box.
//
// The theme's search.js attaches its own `input` listener as soon as it runs,
// so nothing else has to be rewired - but that also means it cannot see
// anything typed before it loaded, hence the synthetic `input` event once it
// is ready.
(function () {
    var input = document.getElementById("search-input");
    if (!input || typeof olivine === "undefined") return;

    var started = false;

    function start() {
        if (started) return;
        started = true;

        var placeholder = input.placeholder;
        input.placeholder = "Loading search...";

        window.loadSearchAssets(function () {
            input.placeholder = placeholder;
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
    }

    // focusin rather than focus: it bubbles, and it fires for touch, click
    // and keyboard alike.
    input.addEventListener("focusin", start);
    input.addEventListener("input", start);
})();

// Copy button on code blocks.
//
// This file is `defer`, so the DOM is parsed by the time it runs. KaTeX
// replaces whole <pre> elements with rendered math on DOMContentLoaded, so
// math blocks are skipped rather than given a button that is about to be
// thrown away with its block.
(function () {
    if (!navigator.clipboard) return; // needs a secure context

    // Line numbers live inside the <code> as spans, so lifting textContent
    // straight off it would paste "1fn horner(...". Strip them from a clone.
    function codeText(code) {
        var clone = code.cloneNode(true);
        var numbers = clone.querySelectorAll(".giallo-ln");
        for (var i = 0; i < numbers.length; i++) numbers[i].remove();
        return clone.textContent;
    }

    var blocks = document.querySelectorAll("main pre");
    for (var i = 0; i < blocks.length; i++) {
        (function (pre) {
            var code = pre.querySelector("code[data-lang]");
            if (!code || code.dataset.lang === "math") return;

            // The <pre> scrolls, so the button cannot live inside it.
            var wrap = document.createElement("div");
            wrap.className = "code-wrap";
            pre.parentNode.insertBefore(wrap, pre);
            wrap.appendChild(pre);

            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "copy-code";
            btn.textContent = "Copy";
            btn.setAttribute("aria-label", "Copy code to clipboard");

            var reset;
            btn.addEventListener("click", function () {
                navigator.clipboard.writeText(codeText(code)).then(function () {
                    btn.textContent = "Copied";
                }, function () {
                    btn.textContent = "Failed";
                });
                clearTimeout(reset);
                reset = setTimeout(function () { btn.textContent = "Copy"; }, 1500);
            });

            wrap.appendChild(btn);
        })(blocks[i]);
    }
})();

// Read-progress bar down the left edge of the content column.
//
// The element is the LOCAL 13 block in templates/base.html and is styled in
// sass/theme-overrides.scss; all this does is keep a --read-progress fraction
// on it up to date.
(function () {
    var bar = document.getElementById("read-progress");
    if (!bar) return;

    var queued = false;

    function update() {
        queued = false;

        var doc = document.documentElement;

        // scrollHeight counts the part below the fold too, so subtracting the
        // viewport leaves exactly the distance that can be scrolled.
        var max = doc.scrollHeight - window.innerHeight;

        // A page that fits on screen has nothing to report. visibility rather
        // than display so the 2px column stays in the flex layout and the
        // text does not shift sideways when a page turns out to be short.
        if (max <= 1) {
            bar.style.visibility = "hidden";
            return;
        }
        bar.style.visibility = "";

        // Rubber-band scrolling overshoots at both ends on iOS and macOS.
        var p = window.scrollY / max;
        bar.style.setProperty("--read-progress", p < 0 ? 0 : p > 1 ? 1 : p);
    }

    // Scroll fires far more often than the screen refreshes; coalesce to one
    // write per frame.
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(update);
    }

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    // The document changes height under us: KaTeX swaps every math <pre> for
    // a rendered block on DOMContentLoaded, the copy buttons above rewrap the
    // code blocks, and images land whenever they land. Each one moves the end
    // of the page, and so what any given scroll position means.
    if (window.ResizeObserver) {
        new ResizeObserver(schedule).observe(document.body);
    }

    update();
})();
