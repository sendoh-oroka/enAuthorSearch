const query =`
  query enWorksQuery($author: String!, $afterID: ID) {
    user(name: $author) {
      attributedPages(
        sort: {
          key: CREATED_AT
          order: DESC
        }
        filter: { wikidotInfo: { category: { eq: "_default" } } },
        first: 50
        after: $afterID
      ) {
        edges {
          node {
            url
            attributions {
              user {
                name
              }
            }
            wikidotInfo {
              title
              rating
              createdAt
            }
            translations {
              url
              attributions {
                user {
                  name
                }
              }
              wikidotInfo {
                title
                rating
                createdAt
              }
            }
            translationOf {
              url
              attributions {
                user {
                  name
                }
              }
              wikidotInfo {
                title
                rating
                createdAt
              }
              translations {
                url
                attributions {
                  user {
                    name
                  }
                }
                wikidotInfo {
                  title
                  rating
                  createdAt
                }
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

let targetAuthor = "";

const wikiRegexes = [
  { pattern: /^http:\/\/scp-wiki\./, branch: "EN"},
  { pattern: /^http:\/\/wanderers-library\./, branch: "WL"},
  { pattern: /^http:\/\/scp-jp\./, branch: "JP"},
  { pattern: /^http:\/\/scp-wiki-cn\./, branch: "CN"},
  { pattern: /^http:\/\/lafundacionscp\./, branch: "ES"},
  { pattern: /^http:\/\/scpko\./, branch: "KO"},
  { pattern: /^http:\/\/scp-pl\./, branch: "PL"},
  { pattern: /^http:\/\/scpfoundation\./, branch: "RU"},
  { pattern: /^http:\/\/scp-zh-tr\./, branch: "ZH"},
  { pattern: /^http:\/\/scp-pt-br\./, branch: "PT"},
  { pattern: /^http:\/\/fondationscp\./, branch: "FR"},
  { pattern: /^http:\/\/fondazionescp\./, branch: "IT"},
  { pattern: /^http:\/\/scp-th\./, branch: "TH"},
  { pattern: /^http:\/\/scp-cs\./, branch: "CS"},
  { pattern: /^http:\/\/scp-wiki-de\./, branch: "DE"},
  { pattern: /^http:\/\/scp-vn\./, branch: "VN"},
  { pattern: /^http:\/\/scp-ukrainian\./, branch: "UR"},
  { pattern: /^http:\/\/scp-idn\./, branch: "ID"},
  { pattern: /^http:\/\/scp-int\./, branch: "INT"},
];

const buildCromApiUrl = (query, variables) =>
  `https://api.crom.avn.sh/graphql?query=${encodeURIComponent(query)}&variables=${encodeURIComponent(JSON.stringify(variables))}`;

async function executeQuery(author, afterID) {
  const variables = { author, afterID }
  const requestUrl = buildCromApiUrl(query, variables);

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    throw new Error(`HTTP Error: ${response.status}`);
  }
  const { data, errors } = await response.json();
  if (errors && errors.length > 0) {
    throw new Error("GraphQL errors: " + JSON.stringify(errors));
  }

  return data;
}

function parseInfo(node, checkJP = false) {
  if (!node) return null;
  const articles = [];

  const addArticle = obj => {
    const names = obj.attributions.map(attr =>
      attr.user.name.toLowerCase()
    );
    if (obj?.wikidotInfo) {
      articles.push({
        url: obj.url,
        title: obj.wikidotInfo.title,
        rating: obj.wikidotInfo.rating,
        createdAt: new Date(obj.wikidotInfo.createdAt),
        name: names,
        branch: null
      });
    }
  };

  addArticle(node);
  if (Array.isArray(node.translations)) {
    node.translations.forEach(addArticle);
  }
  if (node.translationOf) {
    addArticle(node.translationOf);
    if (Array.isArray(node.translationOf.translations)) {
      node.translationOf.translations.forEach(addArticle);
    }
  }

  if (articles.length === 0) return null;

  if (checkJP) {
    const jpArticle = articles.find(article => article.url.indexOf("http://scp-jp.") === 0);
    const wljpArticle = articles.find(article => article.url.indexOf("http://wanderers-library-jp.") === 0);
    if (jpArticle) {
      jpArticle.branch = "JP";
      return jpArticle;
    } else if (wljpArticle) {
      wljpArticle.branch = "WL-JP";
      return wljpArticle;
    } else {
      return null;
    }
  }

  const oriArticle = articles.reduce((earliest, article) => 
    article.createdAt < earliest.createdAt ? article : earliest, articles[0]
  );

  const author = targetAuthor.toLowerCase();
  if (!oriArticle.name.includes(author)) {
    return null;
  }

  for (const {pattern, branch} of wikiRegexes) {
    if (pattern.test(oriArticle.url)) {
      oriArticle.branch = branch;
      return oriArticle.branch === "JP" ? null : oriArticle;
    }
  }

  return null;
}

const getOriInfo = (node) => parseInfo(node);
const getJPinfo = (node) => parseInfo(node, true);

const formatDate = (date) =>
  `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

function buildPageHtml(node) {
  const oriInfo = getOriInfo(node);
  const jpInfo = getJPinfo(node);

  if(!jpInfo) {
    return `
      <div class="untransPage">
        <p><strong>${oriInfo.branch}:</strong> <a href="${oriInfo.url}" target="_blank">${oriInfo.title}</a><span class="postDate"> ${formatDate(oriInfo.createdAt)}投稿</span></p>
      </div>
    `;
  }

  return `
    <div class="page">
      <p><a href="${jpInfo.url}" target="_blank">${jpInfo.title}</a></p>
      <p class="details">
        <strong>原語版:</strong>
        <a href="${oriInfo.url}" target="_blank">${oriInfo.title}</a><span class="postDate"> ${formatDate(jpInfo.createdAt)}翻訳 ${formatDate(oriInfo.createdAt)}投稿</span>
      </p>
      <p class="details">
        <strong>${oriInfo.branch}:</strong> ${oriInfo.rating} / <strong>${jpInfo.branch}:</strong> ${jpInfo.rating}
      </p>
    </div>
  `;
}

function renderPages(pages) {
  const resultContainer = document.getElementById("result");

  if (!pages.length) {
    resultContainer.innerHTML = "<p>Wikidot IDが間違っています。</p>";
    return;
  }

  const processedUrls = new Set();
  const sortedPages = pages
    .map(page => {
      const oriInfo = getOriInfo(page.node);
      return { ...page, oriInfo};
    })
    .filter(({ oriInfo }) => {
      if (!oriInfo || processedUrls.has(oriInfo.url)) return false;
      processedUrls.add(oriInfo.url);
      return true;
    })
    .sort((a, b) => {
      return b.oriInfo.createdAt - a.oriInfo.createdAt;
    });

  const pagesHTML = sortedPages.map(({ node }) => buildPageHtml(node)).join("");
  resultContainer.innerHTML = pagesHTML;
}

async function searchArticle(author) {
  let afterID = null;
  const allPages = [];
  const loadingElement = document.getElementById("loading");
  loadingElement.style.display = "block";

  try {
    do {
      const response = await executeQuery(author, afterID);
      const pages = response.user.attributedPages.edges;
      const hasNextPage = response.user.attributedPages.pageInfo.hasNextPage;

      allPages.push(...pages);
      afterID = hasNextPage ? response.user.attributedPages.pageInfo.endCursor : null;
      if (afterID) await new Promise(resolve => setTimeout(resolve, 500));
    } while(afterID);

    renderPages(allPages);
  } catch (error) {
    console.error("検索に失敗しました", error);
    document.getElementById("result").innerHTML = "<p>エラーが発生しました。再度お試しください。</p>";
  } finally {
    loadingElement.style.display = "none";
  }
}

// DOM読み込み後の初期設定
document.addEventListener("DOMContentLoaded", () => {
  const authorInput = document.getElementById("authorInput");
  const searchButton = document.getElementById("searchButton");
  const resultContainer = document.getElementById("result");

  // 初回検索時のイベント設定
  searchButton.addEventListener("click", () => {
    const author = authorInput.value.trim();
    if (!author) {
      alert("Wikidot IDを入力してください");
      return;
    }

    resultContainer.innerHTML = "";
    targetAuthor = author;
    searchArticle(author);
  });

  authorInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      searchButton.click();
    }
  });
});
