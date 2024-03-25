const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const { Client } = require('pg');

const client = new Client({
    user: 'postgres',
    host: 'localhost',
    database: 'shoppingList2',
    password: 'admin',
    port: 5432
})

async function connentionWithDatabase(){
    try{
        await client.connect();
    } catch (err) {
        console.error('Error during connecting with database', err);
    }
}

async function saveToDatabase(productsNames){
    try {
        const maxProductIdQuery = await client.query('SELECT MAX(products_id) AS maxProductId FROM products');
        let maxProductId = parseInt(maxProductIdQuery.rows[0].maxproductid || 1);
        for(const productName of productsNames){
            const product = await client.query('SELECT * FROM products WHERE product_name = $1', [productName]);
            if(product.rowCount === 0) {
                maxProductId += 1;
                await client.query('INSERT INTO products (products_id, product_name) VALUES ($1, $2)', [maxProductId, productName]);
            }
        }

    } catch (err) {
        console.error('Error during saving to database', err);
    }

}

async function fetch(url) {
    try {
        const response = await axios.get(url);
        const data = response.data;
        return data;
    } catch (err) {
        console.error('Do not found page', err);
        return null;
    }
}

function scrap(html, removedWords) {
    const $ = cheerio.load(html);
    const regex = /\d/;
    const product = $('head title').text();
    const splitedProduct =  product.split('|');
    const productTrim = splitedProduct[0].substring(0, splitedProduct[0].search(regex)).trim().toLowerCase();

    if(productTrim.includes('strona szczegółowa')){
        return null;
    }

    const productName =  productTrim.replace(new RegExp(removedWords.map(r => r.source).join('|'), 'gi'), '').trim();
    console.log(productName);

    return productName;
}

function makeRegexes(){
    const removedWords = fs.readFileSync('removedWords.txt', 'utf-8')
    const removedWordsLines = removedWords.split('\n');
    const regexes = [];
    removedWordsLines.forEach(line => {
        const regexString = '^\\b(' + line.trim().split(' ').join('\\s+') + ')\\b';
        const regex = new RegExp(regexString, 'gi');
        regexes.push(regex);
    });
    return regexes;
}

async function main() {
    const regexes = makeRegexes();
    let productsNames = [];
    let count = 0;
    await connentionWithDatabase();

    const url = 'https://www.kaufland.pl/oferta/aktualny-tydzien/przeglad/strona-szczegolowa.so_id=20709200.html'
    const html = await fetch(url)
    const product = scrap(html, regexes);
    if(product != null){
        productsNames.push(product);
        count += 1;
        console.log(productsNames);
        if(count >= 1){
            await saveToDatabase(productsNames);
            count = 0;
        }
    }
    else {
        console.log("do nothing");
    }
    await client.end();

    /*for (let i = 1; i <= 99; i++) {
        const paddedNumber = String(i).padStart(2, '0');
        console.log(paddedNumber);
    }*/
}

main()