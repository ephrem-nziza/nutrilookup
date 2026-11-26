// NutriLookup will get the data from USDA Food Data Central
const API_KEY = config.apikey;
const BASE = "https://api.nal.usda.gov/fdc/v1";

let allfoods = []; // The last search results

const form = document.getElementById('search-form');
const input = document.getElementById('query');
const typeSel = document.getElementById('type-filter');
const sortSel = document.getElementById('sort-by');
const count = document.getElementById('count');
const loading = document.getElementById('loading');
const errorDiv = document.getElementById('error');
const empty = document.getElementById('empty');
const start_msg = document.getElementById('start-msg');
const list = document.getElementById('results');
const detail = document.getElementById('detail');
const detailContent = document.getElementById('detail-content');
const closeBtn = document.getElementById('close-detail');

function hideAll(){
    loading.classList.add('hidden');
    errorDiv.classList.add('hidden');
    empty.classList.add('hidden');
    start_msg.classList.add('hidden');
}

function showLoading(){
    hideAll();
    loading.classList.remove('hidden');
    list.innerHTML = '';
    count.textContent = '';
}

// Now, I will add a retry button 
function showError(msg){
    hideAll();
    errorDiv.textContent = msg;
    errorDiv.classList.remove('hidden');
}

// Now I will call USDA search, and It will return an array or null if it fails.
async function getFoods(term){
    showLoading();

    let controller = new AbortController();
    let t = setTimeout(function () { controller.abort(); }, 8000);

    try{
        const resp = await fetch(BASE + "/foods/search?query=" + encodeURIComponent(term) + "&pageSize=30&api_key=" + API_KEY, {signal: controller.signal});
        clearTimeout(t);

        if (!resp.ok){
            throw new Error("The status is not Good" + resp.status);
        }

        const json = await resp.json();
        return json.foods || [];
    }catch (error){
        clearTimeout(t);
        console.log("api has failed:", error);

        // I will add a different message for bad key and when the server is down.
        if (error.name == "AbortError"){
            showError("The request has timed out, Please try again");
        }else{
            showError("Couldn't load, Please check your connection or API key and try again.");
        }
        return null;
    }
}

// This will look for nutrients in the food and will return null if they are not there.

function getNutrient(food, id){
    let nutrients = food.foodNutrients || [];
    for (let i = 0; i < nutrients.length; i++){
        if(nutrients[i].nutrientId == id){
            return nutrients[i].value;
        }
    }
    return null;
}

function showDetail(f){
    detailContent.innerHTML = '';

    const title = document.createElement('h2');
    title.textContent = f.description;
    detailContent.appendChild(title);

    // This will reveal that only branded foods have this
    if (f.brandOwner){
        const b = document.createElement('p');
        b.textContent = "Breand: " + f.brandOwner;
        detailContent.appendChild(b);
    }

    const table = document.createElement('table');
    const nutrients = f.foodNutrients || [];
    for (let i = 0; i < nutrients.length; i++){
        const n = nutrients[i];
        const tr= document.createElement('tr');
        const td1 = document.createElement('td');
        const td2 = document.createElement('td');
        td1.textContent = n.nutrientNmae;
        td2.textContent = n.value + " " + (n.unitName || "").toLowerCase();
        tr.appendChild(td1);
        tr.appendChild(td2);
        table.appendChild(tr);
    }
    detailContent.appendChild(table);

    detail.classList.remove('hidden');
}

function showFoods(foods){
    list.innerHTML = '';
    count.textContent = foods.length + (foods.length == 1 ? " result" : "results");

    for(let i = 0; i < foods.length; i++){
        const f = foods[i];
        const cal = getNutrient(f, 1008);
        const prot = getNutrient(f, 1003);

        const li = document.createElement('li');
        const h3 = document.createElement('h3');
        h3.textContent = f.description;

        const p1 = document.createElement('p');
        p1.textContent = "Calories: " + (cal != null ? cal + " kcal" : "n/a");

        const p2 = document.createElement('p');
        p2.textContent = "Protein: " + (prot != null ? prot + " g" : "n/a");

        const p3 = document.createElement('p');
        p3.textContent = f.dataType;

        li.appendChild(h3);
        li.appendChild(p1);
        li.appendChild(p2);
        li.appendChild(p3);
        li.addEventListener('click', function (){
            showDetail(f);
        });
        list.appendChild(li);
    }
}

// This will help to filter, sort, and show by type
function applyFilters(){
    if (allfoods.length == 0) return;

    let shown = [];
    for(let i = 0; i < allfoods.length; i++){
        if (typeSel.value == "" || allfoods[i].dataType == typeSel.value){
            shown.push(allfoods[i]);
        }
    }

    let how = sortSel.value;
    if(how == "name"){
        shown.sort(function(a, b){
            return a.description.localeCompare(b.description);
        });
    }else if(how == "cal-high"){
        shown.sort(function(a, b){
            return (getNutrient(b, 1008) || 0) - (getNutrient(a, 1008) || 0);
        });
    }else if(how == "cal-low"){
        shown.sort(function(a, b){
            let ca = getNutrient(a, 1008);
            let cb = getNutrient(b, 1008);
            if(ca == null) ca = 99999;
            if(cb == null) cb = 99999;
            return ca - cb;
        });
    }else if(how == "protein-high") {
        shown.sort(function(a, b){
            return (getNutrient(b, 1003) || 0) - (getNutrient(a, 1003) || 0);
        });
    }

    if (shown.length == 0){
        empty.classList.remove('hidden');
    }else{
        empty.classList.add('hidden');
    }
    showFoods(shown);
} 

async function doSearch(e){
    e.preventDefault();
    let term = input.value.trim();

    if (term == ""){
        alert("Please type a food first");
        return;
    }

    const foods = await getFoods(term);
    if (foods == null) return;

    allfoods = foods;
    hideAll();
    if (allfoods.length == 0){
        empty.classList.remove('hidden');
    }
    applyFilters(); 
}

form.addEventListener('submit', doSearch);
typeSel.addEventListener('change', applyFilters);
sortSel.addEventListener('change', applyFilters);
closeBtn.addEventListener('click', function(){
    detail.classList.add('hidden');
});

// When clicks outside of the box, it gets closed.
detail.addEventListener('click', function (e){
    if(e.target == detail){
        detail.classList.add('hidden');
    }
});