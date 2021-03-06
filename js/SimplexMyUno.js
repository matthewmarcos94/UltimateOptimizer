const transpose = m => m[0].map((x, i) => m.map(x => x[i]));
const log = console.log;
const foodNames = _.map(foodData, function (food) {
    return {
        foodName: food.food.replace(/_/g, ' '),
        key: food.food,
        isSelected: false,
        isAdded: false
    };
});

// Solve Simplex
const simplex = (tableauWrapper) => {
    const tableauData = _.clone(tableauWrapper);
    let solutions = [];

    let tableau = _.clone(tableauData.tableau);
    const rowCount = tableau.length;
    const colCount = tableau[0].length;
    const variableCount = tableauData.varCount;
    const slackVariableCount = tableauData.slackVariableCount;

    let constraintNames = tableauData.rowHeaders;
    const variableNames = tableauData.variableNames;

    let rowHeaders = [ //Initially rowHeaders are named after the constraints.
        ...constraintNames
    ];

    //So we know the name of the variable to replace in the object
    let tableHeaders = _.clone(tableauData.tableHeaders);

    // console.log(`rowHeaders: ${rowHeaders}`);
    // console.log(`tableHeaders: ${tableHeaders}`);

    const hasNegative = () => {
        let smallest = _.clone(tableau[tableau.length - 1]).sort((x, y) => x - y)[0];
        return smallest < 0;
    }

    let values = _.fromPairs(_.zip(rowHeaders, transpose(tableau)[colCount - 1]))
    _.forEach(variableNames, name => {
        values[name] = 0;
    });

    // START THE SIMPLEX
    solutions.push( {
        tableau: _.clone(tableau),
        variables: _.clone(values)
    });

    // console.log(values);

    while(hasNegative()) {
         // Get the pivot column
        let rowToSearch = tableau[rowCount - 1].slice(0, tableau[rowCount - 1].length - 1);
        let minData = _.reduce(rowToSearch, (acc, value, index) => {
            if(value < acc.minValue) {
                return {
                    minIndex: index,
                    minValue: value
                };
            }
            return acc;
        }, {
            minIndex: 0,
            minValue: rowToSearch[0]
        });

        const minValue = minData.minValue; // Smallest value in bottom row
        const pivotElementCol = minData.minIndex; // Index of the pivot column

        // Get pivot column
        const pivotColumn = transpose(_.clone(tableau))[pivotElementCol];
        const numeratorColumn = transpose(_.clone(tableau))[colCount - 1];
        const trArray = _.map(numeratorColumn, (x, key) => {
            return x/pivotColumn[key];
        });

        let smallestNonzero = _.clone(trArray).sort((x, y) => x - y).filter(x =>{
            const positiveX = (x > 0);
            const xIsANumber = !isNaN(x);
            const isFiniteX = isFinite(x);
            return positiveX && xIsANumber && isFiniteX;
        })[0]
        if(!smallestNonzero) {
            // Infeasible
            Materialize.toast('There is no solution to your problem', 2000);
            return [];
        }
        let pivotElementRow = trArray.indexOf(smallestNonzero);

        // Normalize the pivot row
        let pivotElement = tableau[pivotElementRow][pivotElementCol];
        tableau[pivotElementRow] = tableau[pivotElementRow].map(x => (x / pivotElement).toFixed(4));

        // Normalize the entire column:
        tableau = _.map(tableau, (row, rowNo) => {
            if(rowNo === pivotElementRow) {
                return row;
            }
            const multiplier = row[pivotElementCol]; //divide to pivot row
            const pivotRowCopy = _.clone(tableau[pivotElementRow])
                .map(x => (x * multiplier).toFixed(4));
            const newRow = _.map(pivotRowCopy, (x, index) => {
                return (row[index] - x).toFixed(4);
            });

            return newRow;
        });

        // Reset the name in the rowHeaders for updating of the variables
        rowHeaders[pivotElementRow] = tableHeaders[pivotElementCol]
        // Update the value
        const tempValues = _.fromPairs(_.zip(rowHeaders, transpose(tableau)[colCount - 1]))

        let valuesCopy = _.clone(values);

        _.forEach(tempValues, (val, key) => {
            valuesCopy[key] = val;
        });
        values = valuesCopy;

        solutions.push({
            tableau: _.clone(tableau),
            variables: _.clone(valuesCopy)
        });
    }

    return solutions;
};

const generateTableauU = (constraints, toMaximize, isMaximize) => {
    // Split the maximize expression by spaces
    let maximizeVar = [...toMaximize.split(/[ ]+/g)];

    const toMaximizeExp = /(\+|-)?\d*\.?\d+/;
    // Check if each term on objective function matches the pattern +\d | -\d | \d | decimal
    const validMaximizeExp = _.every(maximizeVar, variable => toMaximizeExp.test(variable));
    if (!validMaximizeExp) {
        return Materialize.toast('Invalid Maximizing Expression', 2000);

    }
    maximizeVar = maximizeVar.map(x => Number(x));

    // If minimize, negate the function.
    if(!isMaximize) {
        maximizeVar = _.map(maximizeVar, (x, key) => {
            return x * -1
        });
    }
    // check constraints if they have <= or >=.
    const allConstraintsHaveSign = _.every(constraints, x => {
        const hasGreaterThan = x.indexOf('<=') !== -1;
        const hasLessThan = x.indexOf('>=') !== -1;
        return (hasGreaterThan && !hasLessThan) || (!hasGreaterThan && hasLessThan);
    });

    if(!allConstraintsHaveSign) {
        return Materialize.toast('Please check constraints for proper format', 2000);
    }

    // Get sign for slack variables
    const slackVariableSign = _.map(constraints, (x, index) => {
        if(x.indexOf('<=') !== -1) {
            return 1
        }
        else if(x.indexOf('>=') !== -1) {
            return -1
        }
    });
    slackVariableSign.push(1); //For the Z

    // Check if all the constraints have proper format, length
    // Create empty array
    let constraintsVar =  constraints.map(x => x.split(/[ ]+/g).map(y => Number(y)).filter(z => !isNaN(z)));

    // Get count of variables
    const varCount = maximizeVar.length
    const allConstraintsHaveProperLength = _.every(constraintsVar, x => {
        return x.length - 1 === varCount;
    });

    if(!allConstraintsHaveProperLength) {
        return Materialize.toast('Not all constraints have the proper length', 2000);
    }

    const fillCount = constraints.length + 1; //How many values to insert for slack variables
    const colCount = varCount + fillCount + 1; //Total number of columns
    const rowCount = fillCount;

    // Convert into tableau
    let tempTableau = _.clone(constraintsVar);
    let tempMaxVar = _.clone(maximizeVar)
    tempMaxVar = tempMaxVar.map(x => -1 * x);
    tempMaxVar.push(0);
    tempTableau.push(tempMaxVar);

    // Insert the slack variables
    tempTableau = _.map(tempTableau, (row, index) => {
        let x = _.clone(row);
        const insertionArrayLength = colCount - x.length;
        let insertionArray = Array.apply(null, {
            length: insertionArrayLength
        }).map(Function.call, x => 0);

        // Put the 1's in a diagonal
        insertionArray = _.map(insertionArray, (something, ind) => {
            if(ind === index) return 1;
            return 0;
        });

        x.splice(x.length-1, 0, insertionArray);



        return _.flatten(x);
    });

    // Multiply negative if greater than or less than
    tempTableau = _.map(tempTableau, (row, index) => {
        let tempRow = _.clone(row);

        return _.map(tempRow, n => n * slackVariableSign[index]);
    });



    const tableHeaders = [
        ..._.map(maximizeVar, (x, key) => 'X' + (key + 1)),
        ..._.map(constraints, (x, key) => 'S' + (key + 1)),
        'Z'
    ];

    const rowHeaders = [
        ..._.map(constraints, (x, key) => 'S' + (key + 1)),
        'Z'
    ]

    return {
        tableau: tempTableau,
        tableHeaders: tableHeaders,
        rowHeaders: rowHeaders,
        varCount: maximizeVar.length,
        slackVariableCount: constraints.length,
        variableNames: [ ..._.map(maximizeVar, (x, key) => 'X' + (key + 1)) ],
        rowCount, colCount
    };
};

// Generate Tableau for Food solver.
const generateTableauF = input => {
    const foods = _.clone(input);
    // Determine number of foodstuff
    const foodCount = foods.length;
    // Constraints:
    // 11 for maximizing nutrients
    // 11 for minimizing nutrients
    // foodCount max servings
    // foodCount min servings
    // price Min <= di na kailangan kasi may min servings na?
    const constraintCount = 23 + foodCount * 2; //Sinama na ang Z?
    const foodNameArray = foods.map(x => x.food);

    // Generate Variables
    let insertionArray = Array.apply(null, {
        length: constraintCount
    }).map(Function.call, x => 0);

    // Objective function
    let priceArray = foods.map(x => x.pricePerServing);

    // constraints
    let caloriesArray = foods.map(x => x.calories);
    let cholesterolArray = foods.map(x => x.cholesterol);
    let totalFatArray = foods.map(x => x.totalFat);
    let sodiumArray = foods.map(x => x.sodium);
    let carbohydratesArray = foods.map(x => x.carbohydrates);
    let dietaryFiberArray = foods.map(x => x.dietaryFiber);
    let proteinArray = foods.map(x => x.protein);
    let vitAArray = foods.map(x => x.vitA);
    let vitCArray = foods.map(x => x.vitC);
    let calciumArray = foods.map(x => x.calcium);
    let ironArray = foods.map(x => x.iron);

    const priceMin = 0;

    const caloriesMin = 2000;
    const cholesterolMin = 0;
    const totalFatMin = 0;
    const sodiumMin = 0;
    const carbohydratesMin = 0;
    const dietaryFiberMin = 25;
    const proteinMin = 50;
    const vitAMin = 5000;
    const vitCMin = 50;
    const calciumMin = 800;
    const ironMin = 10;

    const calorieMax = 2250;
    const cholesterolMax = 300;
    const totalFatMax = 65;
    const sodiumMax = 2400;
    const carbohydratesMax = 300;
    const dietaryFiberMax = 100;
    const proteinMax = 100;
    const vitAMax = 50000;
    const vitCMax = 20000;
    const calciumMax = 1600;
    const ironMax = 30;

    const newRowCount = constraintCount + 1;
    const colCount = foods.length + insertionArray.length + 1;

    const minServingConstraints = _.map(priceArray, (variable, index) => {
        return [
            ...Array.apply(null, {
                length: index
            }).map(Function.call, x => 0),
            1, // Value of Xi
            ...Array.apply(null, {
                // -1 for the var, -1 for the min servings
                length: colCount - index - 2
            }).map(Function.call, x => 0),
            1 // min servings
        ];
    });

    const maxServingConstraints = _.map(priceArray, (variable, index) => {
        return [
            ...Array.apply(null, {
                length: index
            }).map(Function.call, x => 0),
            1, // Value of Xi
            ...Array.apply(null, {
                // -1 for the var, -1 for the max servings
                length: colCount - index - 2
            }).map(Function.call, x => 0),
            10 // max servings
        ];
    });

    const minimizingFunctionRow = [
        ...priceArray.map(x => x),
        ...Array.apply(null, {
            // -1 for the var, -1 for the max servings
            length: colCount - priceArray.length - 1
        }).map(Function.call, x => 0),
        0 // Initial solution
    ];

    let tempTableau =_.map(_.clone([ // Remove reference to insertionArray before mutation
        // Constraints for lessthanequalto
        [ ...caloriesArray, ...insertionArray, calorieMax ],
        [ ...cholesterolArray, ...insertionArray, cholesterolMax ],
        [ ...totalFatArray, ...insertionArray, totalFatMax ],
        [ ...sodiumArray, ...insertionArray, sodiumMax ],
        [ ...carbohydratesArray, ...insertionArray, carbohydratesMax ],
        [ ...dietaryFiberArray, ...insertionArray, dietaryFiberMax ],
        [ ...proteinArray, ...insertionArray, proteinMax ],
        [ ...vitAArray, ...insertionArray, vitAMax ],
        [ ...vitCArray, ...insertionArray, vitCMax ],
        [ ...calciumArray, ...insertionArray, calciumMax ],
        [ ...ironArray, ...insertionArray, ironMax ],

        // Negated version for the minimums
        [ ...caloriesArray.map(x => x), ...insertionArray, caloriesMin ],
        [ ...cholesterolArray.map(x => x), ...insertionArray, cholesterolMin ],
        [ ...totalFatArray.map(x => x), ...insertionArray, totalFatMin ],
        [ ...sodiumArray.map(x => x), ...insertionArray, sodiumMin ],
        [ ...carbohydratesArray.map(x => x), ...insertionArray, carbohydratesMin ],
        [ ...dietaryFiberArray.map(x => x), ...insertionArray, dietaryFiberMin ],
        [ ...proteinArray.map(x => x), ...insertionArray, proteinMin ],
        [ ...vitAArray.map(x => x), ...insertionArray, vitAMin ],
        [ ...vitCArray.map(x => x), ...insertionArray, vitCMin ],
        [ ...calciumArray.map(x => x), ...insertionArray, calciumMin ],
        [ ...ironArray.map(x => x), ...insertionArray, ironMin ],

        ...maxServingConstraints, //maxServings
        ...minServingConstraints, //min Servings
        minimizingFunctionRow //Function to minimize

    ]), (row, index) => {
        let x = _.clone(row);
        x[index + foodCount] = 1;
        if(index === constraintCount - 1) {
            x[index + foodCount] = -1;
        }
        return x;
    });

    // Flipping minimum constraint rows
    tempTableau = _.map(tempTableau, (row, index) => {
        let negativeSlack = ((index >= 11 && index <= 21) || (index >= 22 + foodCount && index < (22 + 2 * foodCount)));

        if(negativeSlack) {
            return row.map(x => -x);
        }
        else {
            return row
        }
    });

/*
    Schema of object to pass to simplex method
    {
        tableau
        varCount
        slackVariableCount
        rowHeaders
        variableNames
        tableHeaders
    }
*/
    // Generate Row Headers
    // Generate Variable Names
    const variableNames = _.map(foodNameArray , (name, index) => `X${index + 1}`);

    let rowHeaders = _.map(insertionArray, (x, index) => `S${index + 1}`);
    rowHeaders[rowHeaders.length - 1] = 'Z';

    const tableHeaders = [
        ...variableNames,
        ...rowHeaders
    ];

    // Generate Table Headers

    const toSimplex = {
        tableau: tempTableau,
        varCount: foodCount,
        slackVariableCount: constraintCount,
        rowHeaders,
        variableNames,
        tableHeaders
    }

    console.log(tempTableau);
    const f = simplex(toSimplex);
    if(f === []) return; //No Solution
    // console.log(f);

    return evalSolution(_.clone(f.pop().variables), _.clone(foods));
};

const evalSolution = (score, foods) => {
    log(score)
    // log(foods)
    let keys = _.map(foods, (food, index) => `X${index + 1}`);

    let diet = {};

    _.forEach(keys, (key, index) => {
        foods[index]['amount'] = score[key];
    });

    return foods;
};
