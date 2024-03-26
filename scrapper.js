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
        console.log(productsNames)

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

async function scrap(html, removedWords) {
    const $ = cheerio.load(html);

    const product = $('head title').text();
    const splitedProduct =  product.split('|');
    const index = splitedProduct[0].search(/\d/);
    //console.log(splitedProduct);

    let productTrim =  splitedProduct[0].substring(0, index).trim().toLowerCase();
    if (!productTrim) {
        productTrim = splitedProduct[0].trim().toLowerCase();
    }

    console.log(productTrim);
    if(productTrim.includes('strona szczegółowa')){
        return null;
    }
  
    const words = await removedWords;
    const productName =  productTrim.replace(new RegExp(words.map(r => r.source).join('|'), 'gi'), '').trim();

    return productName;
}

async function makeRegexes(){
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

    for (let i = 141050; i <= 148000; i++){
        const paddedNumber = String(i).padStart(8, '0');
        console.log(paddedNumber);

        const url = `https://www.kaufland.pl/oferta/aktualny-tydzien/przeglad/strona-szczegolowa.so_id=${paddedNumber}.html`
        //const url = 'https://www.kaufland.pl/oferta/aktualny-tydzien/przeglad/strona-szczegolowa.so_id=20091490.html'

        const html = await fetch(url)
        const product = scrap(html, regexes);
        const resolvedProduct = await product;

        if(resolvedProduct != null){
            productsNames.push(resolvedProduct);

            count += 1;
            console.log(productsNames);
            if(count >= 10){
                await saveToDatabase(productsNames);
                count = 0;
                productsNames.splice(0, productsNames.length);
            }
        }
    }
    if(count != 0) {
        await saveToDatabase(productsNames);
    }
    await client.end();
}

main()