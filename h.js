以下のコードをリファクタリングし、より実行速度が早くメンテナンスがしやすい効率的なコードにしてください。改善箇所のみをコードブロックで出力してください。

```js
// 検索クエリ
const query =`
  query enWorksQuery($author: String!, $afterID: ID) {
    ...
  }
`;

// WikiURL辞書
const wikiDict = new Map([
  ["^http:\/\/scp-wiki\\.", "EN"],
  ["^http:\/\/wanderers-library\\.", "WL"],
  ["^http:\/\/scp-jp\\.", "JP"],
  ["^http:\/\/scp-wiki-cn\\.", "CN"],
  ["^http:\/\/lafundacionscp\\.", "ES"],
  ["^http:\/\/scpko\\.", "KO"],
  ["^http:\/\/scp-pl\\.", "PL"],
  ["^http:\/\/scpfoundation\\.", "RU"],
  ["^http:\/\/scp-zh-tr\\.", "ZH"],
  ["^http:\/\/scp-pt-br\\.", "PT"],
  ["^http:\/\/fondationscp\\.", "FR"],
  ["^http:\/\/fondazionescp\\.", "IT"],
  ["^http:\/\/scp-th\\.", "TH"],
  ["^http:\/\/scp-cs\\.", "CS"],
  ["^http:\/\/scp-wiki-de\\.", "DE"],
  ["^http:\/\/scp-vn\\.", "VN"],
  ["^http:\/\/scp-ukrainian\\.", "UR"],
  ["^http:\/\/scp-idn\\.", "ID"],
  ["^http:\/\/scp-int\\.", "INT"],
]);

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

// 情報抽出関数
function parseInfo(node, checkJP = false) {
  const articles = [];

  const selectInfo = (obj) => ({
    url: obj.url,
    title: obj.wikidotInfo.title,
    rating: obj.wikidotInfo.rating,
    createdAt: new Date(obj.wikidotInfo.createdAt),
    branch: null
  });

  function addArticle(obj) {
    if (obj && obj.wikidotInfo) {
      articles.push(selectInfo(obj));
    }
  }

  if (node) {
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

  console.log(oriArticle.url);
  for (const [pattern, branch] of wikiDict.entries()) {
    const regex = new RegExp(pattern);
    if (regex.test(oriArticle.url)) {
      oriArticle.branch = branch;
      console.log(oriArticle.branch);
      return oriArticle.branch === "JP" ? null : oriArticle;
    }
  }

  return null;
}

const getOriInfo = (node) => parseInfo(node);
const getJPinfo = (node) => parseInfo(node, true);

// HTMLを生成する関数
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
```
