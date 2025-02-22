// 検索クエリ
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
            wikidotInfo {
              title
              rating
              createdAt
            }
            translations {
              url
              wikidotInfo {
                title
                rating
                createdAt
              }
            }
            translationOf {
              url
              translations {
                url
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

// GraphQL API呼び出し用の関数
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

// 共通の情報抽出関数
function extractInfo(node, pattern, checkMainUrl = false) {
  let original = null;
  let translations = [];

  function url(obj) {
    return obj.url;
  }
  const selectInfo = (obj) => ({
    url: obj.url,
    title: obj.wikidotInfo.title,
    rating: obj.wikidotInfo.rating,
    createdAt: new Date(obj.wikidotInfo.createdAt)
  });


  if (checkMainUrl && pattern.test(node.url)) {
    return selectInfo(node);
  }

  if (Array.isArray(node.translations)) {
    const match = node.translations.find((t) => pattern.test(t.url));
    if (match) return selectInfo(match);
  }
  return null;
}

const getOriginalInfo = (node) => extractInfo(node, /^http:\/\/scp-wiki\..*/, true);
const getJPinfo = (node) => extractInfo(node, /^http:\/\/scp-jp\..*/);

// HTMLを生成する関数
const formatDate = (date) =>
  `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;

function buildPageHtml(node) {
  const originalInfo = getOriginalInfo(node);
  const jpInfo = getJPinfo(node);

  if(!jpInfo) {
    return `
      <div class="untransPage">
        <p><strong></strong><a href="${originalInfo.url}" target="_blank">${originalInfo.title}</a><span class="postDate"> ${formatDate(originalInfo.createdAt)}投稿</span></p>
      </div>
    `;
  }

  return `
    <div class="page">
      <p><a href="${jpInfo.url}" target="_blank">${jpInfo.title}</a></p>
      <p class="details">
        <strong>原語版:</strong>
        <a href="${originalInfo.url}" target="_blank">${originalInfo.title}</a><span class="postDate"> ${formatDate(jpInfo.createdAt)}翻訳 ${formatDate(originalInfo.createdAt)}投稿</span>
      </p>
      <p class="details">
        <strong>EN:</strong> ${originalInfo.rating} / <strong>JP:</strong> ${jpInfo.rating}
      </p>
    </div>
  `;
}

// レスポンスからページ情報をレンタリングする関数
function renderPages(pages) {
  const resultContainer = document.getElementById("result");

  // 初回検索時に検索結果が0件の場合
  if (!pages.length) {
    resultContainer.innerHTML = "<p>Wikidot IDが間違っています。</p>";
    return;
  }

  // 日付ソート・重複削除
  const processedUrls = new Set();
  const sortedPages = pages
    .map(page => {
      const originalInfo = getOriginalInfo(page.node);
      return { ...page, originalInfo};
    })
    .filter(({ originalInfo }) => {
      if (!originalInfo || processedUrls.has(originalInfo.url)) return false;
      processedUrls.add(originalInfo.url);
      return true;
    })
    .sort((a, b) => {
      return b.originalInfo.createdAt - a.originalInfo.createdAt;
    });

  const pagesHTML = sortedPages.map(({ node }) => buildPageHtml(node)).join("");
  resultContainer.innerHTML = pagesHTML;
}

// ローディングアニメーションを管理する関数
function showLoading(show) {
  const loadingElement = document.getElementById("loading");
  loadingElement.style.display = show ? "block" : "none";
}

// 検索結果の取得とレンダリングを行う関数
async function searchArticle(author) {
  let afterID = null;
  const allPages = [];
  showLoading(true);

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
    showLoading(false);
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
    searchArticle(author);
  });

  authorInput.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      searchButton.click();
    }
  });
});
