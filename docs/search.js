// OVERRIDE of themes/olivine/static/search.js.
//
// Zola's static/ shadows a theme's by filename, so this replaces the theme's
// copy wholesale. Two changes from upstream, both in initSearch(); makeTeaser
// is untouched.
//
//   1. `expand: true` in the search options. Without it elasticlunr matches
//      whole terms only, so "estri" found nothing and the article appeared
//      only once "estrin" was fully typed. Prefix matching is what makes a
//      search-as-you-type box feel like one. (The stemmer masks this for some
//      words - "denorm" already matched "denormals" - which makes the gap
//      look intermittent rather than systematic.)
//
//   2. Enter goes to /search/?q=..., the full results page. Upstream has no
//      keyboard handling at all: it listens for `input` and nothing else, so
//      pressing Enter did nothing whatsoever. The dropdown still shows the
//      top few hits as you type; Enter is for seeing all of them.
//
// Loaded on demand by loadSearchAssets() in static/site.js, not from a script
// tag in base.html.

// Taken from https://github.com/getzola/zola/
// Taken from mdbook
// The strategy is as follows:
// First, assign a value to each word in the document:
//  Words that correspond to search terms (stemmer aware): 40
//  Normal words: 2
//  First word in a sentence: 8
// Then use a sliding window with a constant number of words and count the
// sum of the values of the words within the window. Then use the window that got the
// maximum sum. If there are multiple maximas, then get the last one.
// Enclose the terms in <b>.
function makeTeaser(body, terms) {
  var TERM_WEIGHT = 40;
  var NORMAL_WORD_WEIGHT = 2;
  var FIRST_WORD_WEIGHT = 8;
  var TEASER_MAX_WORDS = 10;

  var stemmedTerms = terms.map(function (w) {
    return elasticlunr.stemmer(w.toLowerCase());
  });
  var termFound = false;
  var index = 0;
  var weighted = []; // contains elements of ["word", weight, index_in_document]

  // split in sentences, then words
  var sentences = body.toLowerCase().split(". ");

  for (var i in sentences) {
    var words = sentences[i].split(" ");
    var value = FIRST_WORD_WEIGHT;

    for (var j in words) {
      var word = words[j];

      if (word.length > 0) {
        for (var k in stemmedTerms) {
          if (elasticlunr.stemmer(word).startsWith(stemmedTerms[k])) {
            value = TERM_WEIGHT;
            termFound = true;
          }
        }
        weighted.push([word, value, index]);
        value = NORMAL_WORD_WEIGHT;
      }

      index += word.length;
      index += 1;  // ' ' or '.' if last word in sentence
    }

    index += 1;  // because we split at a two-char boundary '. '
  }

  if (weighted.length === 0) {
    return body;
  }

  var windowWeights = [];
  var windowSize = Math.min(weighted.length, TEASER_MAX_WORDS);
  // We add a window with all the weights first
  var curSum = 0;
  for (var i = 0; i < windowSize; i++) {
    curSum += weighted[i][1];
  }
  windowWeights.push(curSum);

  for (var i = 0; i < weighted.length - windowSize; i++) {
    curSum -= weighted[i][1];
    curSum += weighted[i + windowSize][1];
    windowWeights.push(curSum);
  }

  // If we didn't find the term, just pick the first window
  var maxSumIndex = 0;
  if (termFound) {
    var maxFound = 0;
    // backwards
    for (var i = windowWeights.length - 1; i >= 0; i--) {
      if (windowWeights[i] > maxFound) {
        maxFound = windowWeights[i];
        maxSumIndex = i;
      }
    }
  }

  var teaser = [];
  var startIndex = weighted[maxSumIndex][2];
  for (var i = maxSumIndex; i < maxSumIndex + windowSize; i++) {
    var word = weighted[i];
    if (startIndex < word[2]) {
      // missing text from index to start of `word`
      teaser.push(body.substring(startIndex, word[2]));
      startIndex = word[2];
    }

    // add <em/> around search terms
    if (word[1] === TERM_WEIGHT) {
      teaser.push("<b>");
    }
    startIndex = word[2] + word[0].length;
    teaser.push(body.substring(word[2], startIndex));

    if (word[1] === TERM_WEIGHT) {
      teaser.push("</b>");
    }
  }
  teaser.push("…");
  return teaser.join("");
}

(function initSearch() {
  const $searchInput = document.getElementById("search-input");
  const $searchResults = document.getElementById("search-results");
  const index = elasticlunr.Index.load(window.searchIndex);
  const options = {
    // `description` only participates because it is named here - listing it
    // under [search] in zola.toml puts it in the index, nothing more. It sits
    // between title and body: a hand-written summary, so better signal than
    // prose, but shorter and less specific than a title.
    fields: { title: {boost: 2}, description: {boost: 1.5}, body: {boost: 1}, },
    expand: true,
  };
  const MAX_ITEMS = 7;

  $searchInput.addEventListener("keydown", function(e) {
    if (e.key !== "Enter") return;
    const term = $searchInput.value.trim();
    if (!term) return;
    e.preventDefault();
    window.location.href = olivine.base_url + "/search/?q=" + encodeURIComponent(term);
  });

  $searchInput.addEventListener("input", function() {
    $searchResults.innerHTML = "";
    const term = $searchInput.value.trim();
    const results = index.search(term, options);
    for (let i = 0; i < Math.min(results.length, MAX_ITEMS); i++) {
      const item = document.createElement("p");
      const res = results[i];

      item.innerHTML = `<a href="${res.ref}">${res.doc.title}</a>: ${makeTeaser(res.doc.body, term.split(' '))}</div>`;
      $searchResults.appendChild(item);
    }
  });
})();

