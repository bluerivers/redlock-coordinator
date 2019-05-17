module.exports = {
    extends: ['airbnb-base'],
    rules: {
        indent: ["error", 4],
        'max-len': ["error", 120],
        // _id - mongodb에서 쓰는 변수라 제외
        'no-underscore-dangle': ["error", { "allow": ["_id"] }]
    }
};